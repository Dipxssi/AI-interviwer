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
  | { type: "INTERVIEW_ENDED" }
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

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceStateRef = useRef<VoiceState>("IDLE");
  const audioMimeRef = useRef("audio/mpeg");
  const pcmChunksSentRef = useRef(0);

  function setState(next: VoiceState) {
    voiceStateRef.current = next;
    setVoiceState(next);
  }

  function cleanup() {
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

  async function playMp3(bytes: ArrayBuffer): Promise<void> {
    const blob = new Blob([bytes], { type: audioMimeRef.current });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
  
    setState("AI_SPEAKING");
    setStatus("Interviewer speaking…");
  
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Audio playback failed"));
        };
        void audio.play().catch(reject);
      });
    } catch {
      setError("Audio blocked — click anywhere on the page, then refresh");
      return;
    }
  
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "AUDIO_PLAYBACK_DONE" }));
    }
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
          if (event.state === "LISTENING") setStatus("Your turn — speak naturally");
          if (event.state === "AI_SPEAKING") setStatus("Interviewer speaking…");
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
          break;
        case "INTERVIEW_ENDED":
          setState("ENDING");
          setStatus("Interview ended");
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

      // Silent output — keeps processor alive without speaker feedback
      const silent = audioCtx.createGain();
      silent.gain.value = 0;

      processor.onaudioprocess = (e) => {
        const socket = wsRef.current;
        const ctx = audioCtxRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !ctx) return;

        const input = e.inputBuffer.getChannelData(0);
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
          void playMp3(msg.data as ArrayBuffer);
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
  };
}