import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/config";

type VoiceState =
  | "IDLE"
  | "AI_SPEAKING"
  | "LISTENING"
  | "CANDIDATE_SPEAKING"
  | "PROCESSING"
  | "ENDING";

type ServerEvent =
  | { type: "SESSION_READY"; interviewId: string; state: VoiceState }
  | { type: "STATE_CHANGED"; state: VoiceState }
  | { type: "PARTIAL_TRANSCRIPT"; text: string }
  | { type: "FINAL_TRANSCRIPT"; text: string }
  | { type: "LLM_STARTED" }
  | { type: "LLM_TEXT_DELTA"; text: string }
  | { type: "TTS_AUDIO_START"; sequence: number; mimeType: string }
  | { type: "ASSISTANT_FINISHED" }
  | { type: "INTERVIEW_ENDED"; score?: number; interviewId?: string }
  | { type: "ERROR"; message: string }
  | { type: "CANDIDATE_INTERRUPTED" };

const TARGET_SAMPLE_RATE = 16000;

function toWsUrl(interviewId: string): string {
  const http = new URL(BACKEND_URL);
  const protocol = http.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${http.host}/ws/interview/${interviewId}`;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function downsampleTo16k(
  input: Float32Array,
  inputSampleRate: number,
): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(input.length / ratio);
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

export function useVoiceInterview(interviewId: string | null) {
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [micActive, setMicActive] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceStateRef = useRef<VoiceState>("IDLE");
  const audioMimeRef = useRef("audio/mpeg");
  const pcmChunksSentRef = useRef(0);

  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentObjectUrlRef = useRef<string | null>(null);

  const speechMsRef = useRef(0);
  const bargeSentRef = useRef(false);
  const playbackAbortedRef = useRef(false);
  /** Ignore mic briefly after AI finishes so speaker echo isn't transcribed as you. */
  const micMuteUntilRef = useRef(0);
  const playbackDoneSentRef = useRef(false);
  const aiSpeakingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const assistantFinishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  function setState(next: VoiceState) {
    voiceStateRef.current = next;
    setVoiceState(next);
  }

  function clearAiSpeakingWatchdog() {
    if (aiSpeakingWatchdogRef.current) {
      clearTimeout(aiSpeakingWatchdogRef.current);
      aiSpeakingWatchdogRef.current = null;
    }
  }

  function signalPlaybackDone() {
    if (playbackDoneSentRef.current) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (voiceStateRef.current === "ENDING") return;

    playbackDoneSentRef.current = true;
    clearAiSpeakingWatchdog();
    wsRef.current.send(JSON.stringify({ type: "AUDIO_PLAYBACK_DONE" }));

    // Optimistic local recovery if server ack is slow / missed.
    if (
      voiceStateRef.current === "AI_SPEAKING" ||
      voiceStateRef.current === "PROCESSING"
    ) {
      setState("LISTENING");
      setStatus("Your turn — speak naturally");
      bargeSentRef.current = false;
      micMuteUntilRef.current = Date.now() + 1200;
    }
  }

  function armAiSpeakingWatchdog() {
    clearAiSpeakingWatchdog();
    aiSpeakingWatchdogRef.current = setTimeout(() => {
      console.warn("[voice] AI speaking watchdog — forcing turn handoff");
      stopPlayback();
      playbackAbortedRef.current = false;
      signalPlaybackDone();
    }, 45000);
  }

  function stopPlayback() {
    playbackAbortedRef.current = true;
    audioQueueRef.current = [];

    const audio = currentAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
      currentAudioRef.current = null;
    }

    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }

    isPlayingRef.current = false;
  }

  function cleanup() {
    stopPlayback();
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setMicActive(false);
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "STOP_SESSION" }));
          wsRef.current.close();
        }
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }

  async function playOneMp3(bytes: ArrayBuffer): Promise<boolean> {
    if (playbackAbortedRef.current) return false;

    const blob = new Blob([bytes], { type: audioMimeRef.current });
    const url = URL.createObjectURL(blob);
    currentObjectUrlRef.current = url;

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    setState("AI_SPEAKING");
    setStatus("Interviewer speaking…");
    armAiSpeakingWatchdog();

    // ~16KB/s rough MP3 floor; never hang forever if onended never fires.
    const maxMs = Math.min(60000, Math.max(10000, bytes.byteLength / 2));

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Audio playback timeout"));
        }, maxMs);

        const finish = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          if (currentObjectUrlRef.current === url) {
            currentObjectUrlRef.current = null;
          }
          currentAudioRef.current = null;
        };

        audio.onended = () => {
          finish();
          resolve();
        };
        audio.onerror = () => {
          finish();
          reject(new Error("Audio playback failed"));
        };
        void audio.play().catch((err) => {
          finish();
          reject(err);
        });
      });
      return true;
    } catch {
      if (!playbackAbortedRef.current) {
        setError("Audio blocked — click anywhere on the page, then refresh");
      }
      try {
        audio.pause();
        audio.src = "";
      } catch {
        // ignore
      }
      return false;
    }
  }

  async function drainAudioQueue(): Promise<void> {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    let attempted = 0;

    while (audioQueueRef.current.length > 0) {
      if (playbackAbortedRef.current) break;
      const bytes = audioQueueRef.current.shift()!;
      attempted += 1;
      await playOneMp3(bytes);
      if (playbackAbortedRef.current) break;
    }

    isPlayingRef.current = false;

    if (attempted > 0 && !playbackAbortedRef.current) {
      signalPlaybackDone();
    }
  }

  function enqueueMp3(bytes: ArrayBuffer) {
    if (playbackAbortedRef.current) return;
    if (bytes.byteLength === 0) return;
    audioQueueRef.current.push(bytes);
    void drainAudioQueue();
  }

  useEffect(() => {
    if (!interviewId) return;

    let cancelled = false;
    pcmChunksSentRef.current = 0;

    function handleServerEvent(event: ServerEvent) {
      switch (event.type) {
        case "SESSION_READY":
          setState(event.state);
          setStatus("Connected — interviewer starting…");
          break;
        case "STATE_CHANGED":
          setState(event.state);
          if (event.state === "LISTENING") {
            setStatus("Your turn — speak naturally");
            bargeSentRef.current = false;
            clearAiSpeakingWatchdog();
            // Hangover mute: leftover TTS in the room must not become "your" answer.
            micMuteUntilRef.current = Date.now() + 1200;
          }
          if (event.state === "AI_SPEAKING") {
            setStatus("Interviewer speaking…");
            armAiSpeakingWatchdog();
          }
          if (event.state === "PROCESSING") setStatus("Thinking…");
          if (event.state === "CANDIDATE_SPEAKING") setStatus("Listening to you…");
          break;
        case "PARTIAL_TRANSCRIPT":
          setPartial(event.text);
          break;
        case "FINAL_TRANSCRIPT":
          setFinalText(event.text);
          setPartial("");
          break;
        case "LLM_TEXT_DELTA":
          setAssistantText(event.text);
          break;
        case "TTS_AUDIO_START":
          audioMimeRef.current = event.mimeType || "audio/mpeg";
          playbackAbortedRef.current = false;
          playbackDoneSentRef.current = false;
          break;
        case "ASSISTANT_FINISHED":
          // TTS finished sending. If no/late audio, don't stay stuck forever.
          if (assistantFinishedTimerRef.current) {
            clearTimeout(assistantFinishedTimerRef.current);
          }
          assistantFinishedTimerRef.current = setTimeout(() => {
            if (
              !isPlayingRef.current &&
              audioQueueRef.current.length === 0 &&
              !playbackDoneSentRef.current
            ) {
              signalPlaybackDone();
            }
          }, 500);
          break;
        case "CANDIDATE_INTERRUPTED":
          stopPlayback();
          clearAiSpeakingWatchdog();
          setAssistantText("");
          setState("CANDIDATE_SPEAKING");
          setStatus("Go ahead…");
          break;
        case "INTERVIEW_ENDED":
          setState("ENDING");
          setStatus("Interview ended");
          if (typeof event.score === "number") {
            setScore(event.score);
          }
          setEnded(true);
          cleanup();
          break;
        case "ERROR":
          setError(event.message);
          break;
        default:
          break;
      }
    }

    async function startMic() {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const audioCtx = new AudioContext();
      await audioCtx.resume();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const silent = audioCtx.createGain();
      silent.gain.value = 0;

      processor.onaudioprocess = (e) => {
        const socket = wsRef.current;
        const ctx = audioCtxRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !ctx) return;

        const input = e.inputBuffer.getChannelData(0);
        const state = voiceStateRef.current;
        const aiTurn = state === "AI_SPEAKING" || state === "PROCESSING";

        if (aiTurn) {
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i]! * input[i]!;
          const rms = Math.sqrt(sum / input.length);
          const frameMs = (input.length / ctx.sampleRate) * 1000;

          // Higher threshold + longer hold so speaker echo doesn't barge-in.
          if (rms > 0.045) {
            speechMsRef.current += frameMs;
          } else {
            speechMsRef.current = 0;
          }

          if (speechMsRef.current >= 400 && !bargeSentRef.current) {
            bargeSentRef.current = true;
            stopPlayback();
            setAssistantText("");
            setState("CANDIDATE_SPEAKING");
            setStatus("Go ahead…");
            socket.send(JSON.stringify({ type: "BARGE_IN" }));
          }

          // Do not stream mic to ASR while AI is talking — echo keeps
          // Deepgram "hot" so speech_final never fires and turns stall.
          return;
        }

        speechMsRef.current = 0;
        bargeSentRef.current = false;

        // Post-AI echo window — do not stream to ASR yet.
        if (Date.now() < micMuteUntilRef.current) {
          return;
        }

        const pcm16k = downsampleTo16k(input, ctx.sampleRate);
        socket.send(floatTo16BitPCM(pcm16k));
        pcmChunksSentRef.current += 1;
      };

      source.connect(processor);
      processor.connect(silent);
      silent.connect(audioCtx.destination);

      setMicActive(true);
      console.log("[voice] mic ready, sampleRate=", audioCtx.sampleRate);
    }

    async function boot() {
      try {
        setStatus("Connecting…");

        const ws = new WebSocket(toWsUrl(interviewId));
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onmessage = (msg) => {
          if (typeof msg.data === "string") {
            try {
              handleServerEvent(JSON.parse(msg.data) as ServerEvent);
            } catch {
              setError("Invalid server JSON");
            }
            return;
          }
          enqueueMp3(msg.data as ArrayBuffer);
        };

        ws.onerror = () => setError("WebSocket error");
        ws.onclose = () => {
          if (!cancelled) setStatus("Disconnected");
        };

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("WS failed"));
        });

        if (cancelled) return;

        setStatus("Requesting microphone…");
        await startMic();

        if (cancelled) return;
        setStatus("Live — speak when it's your turn");
      } catch (err) {
        console.error("[voice] boot failed", err);
        setError(
          err instanceof Error ? err.message : "Failed to start voice interview",
        );
        setStatus("Failed to start");
      }
    }

    void boot();

    return () => {
      cancelled = true;
      clearAiSpeakingWatchdog();
      if (assistantFinishedTimerRef.current) {
        clearTimeout(assistantFinishedTimerRef.current);
      }
      cleanup();
    };
  }, [interviewId]);

  return {
    voiceState,
    partial,
    finalText,
    assistantText,
    error,
    status,
    micActive,
    score,
    ended,
  };
}