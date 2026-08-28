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
    endpointing: "300", 
  });

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export class DeepgramLiveAsr {
  private ws: WebSocket | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly callbacks: LiveAsrCallbacks;

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

  close(): void {
    this.stopKeepAlive();

    if (!this.ws) return;

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws.close();
    } else {
      this.ws.close();
    }

    this.ws = null;
  }

  private handleMessage(raw: string): void {
    let msg: DeepgramLiveMessage;
    try {
      msg = JSON.parse(raw) as DeepgramLiveMessage;
    } catch {
      return;
    }
  
    if (msg.type !== "Results") return;
  
    const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!transcript) return;
  
    // Only trigger a turn when the user actually stopped speaking
    if (msg.speech_final) {
      this.callbacks.onFinal(transcript);
      return;
    }
  
    // Live text while speaking
    if (!msg.is_final) {
      this.callbacks.onPartial(transcript);
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