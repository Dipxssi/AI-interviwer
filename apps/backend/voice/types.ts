import type { InterviewState } from "../interview-engine/type";


export type VoiceState =
 | "IDLE"
  | "AI_SPEAKING"
  | "LISTENING"
  | "CANDIDATE_SPEAKING"
  | "PROCESSING"
  | "ENDING";

  export type VoicePolicy = {
    interruption: {
      minDurationMs: number;
      confirmAfterMs: number;
      speechProbabilityThreshold: number;
      rmsThresholdDb: number;
      stopPlaybackImmediately: boolean; // duck/stop path
    };
    endpoint: {
      minSilenceMs: number;
      defaultSilenceMs: number;
      maxSilenceMs: number;
      incompleteSentenceExtraMs: number;
      semanticEndpointEnabled: boolean;
    };
    speculation: {
      enabled: boolean;
      minPartialTranscriptChars: number;
      minSilenceMs: number;
      confidenceThreshold: number;
    };
  };
  
  export const defaultVoicePolicy: VoicePolicy = {
    interruption: {
      minDurationMs: 180,
      confirmAfterMs: 120,
      speechProbabilityThreshold: 0.75,
      rmsThresholdDb: -42,
      stopPlaybackImmediately: true,
    },
    endpoint: {
      minSilenceMs: 900,
      defaultSilenceMs: 1400,
      maxSilenceMs: 2200,
      incompleteSentenceExtraMs: 800,
      semanticEndpointEnabled: true,
    },
    speculation: {
      enabled: false, // turn on only after live MVP is stable
      minPartialTranscriptChars: 30,
      minSilenceMs: 250,
      confidenceThreshold: 0.85,
    },
  };



export type VoiceEvent =
  | { type: "SESSION_READY"; interviewId: string; state: VoiceState }
  | { type: "STATE_CHANGED"; state: VoiceState }
  | { type: "AUDIO_STARTED" }
  | { type: "AUDIO_ENDED" }
  | { type: "PARTIAL_TRANSCRIPT"; text: string }
  | { type: "FINAL_TRANSCRIPT"; text: string }
  | { type: "CANDIDATE_INTERRUPTED" }
  | { type: "LLM_STARTED" }
  | { type: "LLM_TEXT_DELTA"; text: string }
  | { type: "TTS_AUDIO_START"; sequence: number; mimeType: string }
  | { type: "ASSISTANT_FINISHED" }
  | { type: "INTERVIEW_ENDED"; score: number; interviewId: string }
  | { type: "ERROR"; message: string };


export type ClientVoiceMessage =
  | { type: "START_SESSION" }
  | { type: "STOP_SESSION" }
  | { type: "BARGE_IN" }
  | { type: "AUDIO_PLAYBACK_DONE" };


export type InterviewSessionData = {
  interviewId: string;
  state: VoiceState;
  partialTranscript: string;
  currentAssistantMessageId?: string;
  abortLlm?: AbortController;
  abortTts?: AbortController;
  interviewState: InterviewState;
  ttsSequence: number;
  policy: VoicePolicy;
};

export const BINARY_AUDIO_PCM_RATE = 16000;
export const BINARY_AUDIO_CHANNELS = 1;