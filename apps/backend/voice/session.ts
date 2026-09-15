import type { InterviewState } from "../interview-engine/type";
import {
  defaultVoicePolicy,
  type ClientVoiceMessage,
  type InterviewSessionData,
  type VoiceEvent,
  type VoicePolicy,
  type VoiceState,
} from "./types";

export type EmitFn = (event: VoiceEvent) => void;

export type CreateSessionArgs = {
  interviewId: string;
  interviewState: InterviewState;
  emit: EmitFn;
  policy?: VoicePolicy;
};

export class InterviewSession {
  readonly interviewId: string;
  private data: InterviewSessionData;
  private readonly emit: EmitFn;
  private finalScore = 0;

  constructor(args: CreateSessionArgs) {
    this.interviewId = args.interviewId;
    this.emit = args.emit;
    this.data = {
      interviewId: args.interviewId,
      state: "IDLE",
      partialTranscript: "",
      interviewState: args.interviewState,
      ttsSequence: 0,
      policy: args.policy ?? { ...defaultVoicePolicy },
      abortLlm: undefined,
      abortTts: undefined,
    };
  }

  get state(): VoiceState {
    return this.data.state;
  }

  get policy(): VoicePolicy {
    return this.data.policy;
  }

  get interviewState(): InterviewState {
    return this.data.interviewState;
  }

  get partialTranscript(): string {
    return this.data.partialTranscript;
  }

  get score(): number {
    return this.finalScore;
  }

  snapshot(): Readonly<InterviewSessionData> {
    return this.data;
  }

  start(): void {
    this.transition("LISTENING");
    this.emit({
      type: "SESSION_READY",
      interviewId: this.interviewId,
      state: this.data.state,
    });
  }

  transition(next: VoiceState): void {
    if (this.data.state === next) return;
    this.data.state = next;
    this.emit({ type: "STATE_CHANGED", state: next });
  }

  setPartialTranscript(text: string): void {
    this.data.partialTranscript = text;
    this.emit({ type: "PARTIAL_TRANSCRIPT", text });
  }

  setInterviewState(state: InterviewState): void {
    this.data.interviewState = state;
  }

  setFinalScore(score: number): void {
    this.finalScore = score;
  }

  beginLlm(): AbortController {
    this.data.abortLlm?.abort();
    const controller = new AbortController();
    this.data.abortLlm = controller;
    this.emit({ type: "LLM_STARTED" });
    return controller;
  }

  beginTts(): AbortController {
    this.data.abortTts?.abort();
    const controller = new AbortController();
    this.data.abortTts = controller;
    this.data.ttsSequence += 1;
    this.emit({
      type: "TTS_AUDIO_START",
      sequence: this.data.ttsSequence,
      mimeType: "audio/mpeg",
    });
    return controller;
  }

  nextTtsSequence(): number {
    this.data.ttsSequence += 1;
    return this.data.ttsSequence;
  }

  handleBargeIn(): void {
    if (this.data.state !== "AI_SPEAKING" && this.data.state !== "PROCESSING") {
      return;
    }

    this.data.abortLlm?.abort();
    this.data.abortTts?.abort();
    this.data.abortLlm = undefined;
    this.data.abortTts = undefined;
    this.data.partialTranscript = "";

    this.emit({ type: "CANDIDATE_INTERRUPTED" });
    this.transition("CANDIDATE_SPEAKING");
  }

  handleClientMessage(msg: ClientVoiceMessage): void {
    switch (msg.type) {
      case "START_SESSION":
        this.start();
        break;
      case "BARGE_IN":
        this.handleBargeIn();
        break;
      case "STOP_SESSION":
        this.shutdown();
        break;
      default:
        break;
    }
  }

  onFinalTranscript(text: string): void {
    this.data.partialTranscript = text;
    this.emit({ type: "FINAL_TRANSCRIPT", text });
    this.transition("PROCESSING");
  }

  onAssistantAudioSent(): void {
    this.emit({ type: "ASSISTANT_FINISHED" });
  }

  onPlaybackFinished(): void {
    if (this.data.interviewState.shouldEnd) {
      this.transition("ENDING");
      this.emit({
        type: "INTERVIEW_ENDED",
        score: this.finalScore,
        interviewId: this.interviewId,
      });
      return;
    }
    this.data.partialTranscript = "";
    this.transition("LISTENING");
  }

  shutdown(): void {
    this.data.abortLlm?.abort();
    this.data.abortTts?.abort();
    this.transition("ENDING");
    this.emit({
      type: "INTERVIEW_ENDED",
      score: this.finalScore,
      interviewId: this.interviewId,
    });
  }

  emitAssistantText(text: string): void {
    this.emit({ type: "LLM_TEXT_DELTA", text });
  }
}
