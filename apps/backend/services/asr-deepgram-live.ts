import WebSocket from "ws";
import {
  BINARY_AUDIO_CHANNELS,
  BINARY_AUDIO_PCM_RATE,
} from "../voice/types";

export type LiveAsrCallbacks = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
};

type DeepgramLiveMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  };
};

function buildDeepgramListenUrl(): string {
  const params = new URLSearchParams({
    model: "nova-2",
    encoding: "linear16",
    sample_rate: String(BINARY_AUDIO_PCM_RATE),
    channels: String(BINARY_AUDIO_CHANNELS),
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    // Longer silence so thinking pauses mid-answer don't cut the turn.
    endpointing: "1400",
    // True end-of-utterance backup (must be > endpointing).
    utterance_end_ms: "2200",
  });

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

/** Prefer waiting through mid-thought pauses unless the sentence looks finished. */
function looksLikeFinishedUtterance(text: string): boolean {
  const t = text.trim();
  if (t.length < 24) return false;
  return /[.!?…]["')\]]?\s*$/.test(t);
}

export class DeepgramLiveAsr {
  private ws: WebSocket | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly callbacks: LiveAsrCallbacks;
  /** Concatenate every is_final segment until speech_final / UtteranceEnd. */
  private finalParts: string[] = [];

  constructor(callbacks: LiveAsrCallbacks) {
    this.callbacks = callbacks;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return Promise.reject(new Error("Missing DEEPGRAM_API_KEY"));
    }

    if (this.isOpen) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(buildDeepgramListenUrl(), {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      this.ws = ws;

      ws.on("open", () => {
        this.startKeepAlive();
        resolve();
      });

      ws.on("message", (data) => {
        this.handleMessage(data.toString("utf8"));
      });

      ws.on("error", (err) => {
        this.callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
        reject(err);
      });

      ws.on("close", () => {
        this.stopKeepAlive();
        this.ws = null;
      });
    });
  }

  sendPcm(chunk: Buffer): void {
    if (!this.isOpen || chunk.byteLength === 0) return;
    this.ws!.send(chunk);
  }

  /** Drop in-progress utterance (barge-in / turn reset). */
  resetUtterance(): void {
    this.finalParts = [];
  }

  close(): void {
    this.stopKeepAlive();
    this.resetUtterance();

    if (!this.ws) return;

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws.close();
    } else {
      this.ws.close();
    }

    this.ws = null;
  }

  private flushFinal(): void {
    const text = this.finalParts.join(" ").replace(/\s+/g, " ").trim();
    this.finalParts = [];
    if (!text) return;
    this.callbacks.onFinal(text);
  }

  private handleMessage(raw: string): void {
    let msg: DeepgramLiveMessage;
    try {
      msg = JSON.parse(raw) as DeepgramLiveMessage;
    } catch {
      return;
    }

    // Backup end-of-turn when VAD never marks speech_final (noise/echo).
    if (msg.type === "UtteranceEnd") {
      if (this.finalParts.length > 0) {
        this.flushFinal();
      }
      return;
    }

    if (msg.type !== "Results") return;

    const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";

    // Empty Results can still carry speech_final — flush buffered finals.
    if (!transcript) {
      if (msg.speech_final && this.finalParts.length > 0) {
        const buffered = this.finalParts.join(" ").trim();
        // Incomplete thought: wait for UtteranceEnd instead of cutting mid-answer.
        if (looksLikeFinishedUtterance(buffered)) {
          this.flushFinal();
        }
      }
      return;
    }

    if (msg.is_final) {
      this.finalParts.push(transcript);
      this.callbacks.onPartial(this.finalParts.join(" "));
    } else {
      const live = [...this.finalParts, transcript].join(" ").trim();
      this.callbacks.onPartial(live);
    }

    if (msg.speech_final) {
      const buffered = this.finalParts.join(" ").trim();
      // Don't end the candidate turn on a short thinking pause.
      // UtteranceEnd (~2.2s quiet) still commits incomplete sentences.
      if (looksLikeFinishedUtterance(buffered)) {
        this.flushFinal();
      }
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.isOpen) {
        this.ws!.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, 8000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
