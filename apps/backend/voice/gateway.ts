import type { Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { prisma } from "../db";
import { CandidateProfile } from "../types";
import { createInitialState } from "../interview-engine/state";
import type { InterviewState } from "../interview-engine/type";
import { InterviewSession } from "./session";
import type { ClientVoiceMessage, VoiceEvent } from "./types";
import { DeepgramLiveAsr } from "../services/asr-deepgram-live";
import { runInterviewTurn } from "./run-turn";

// Prevents duplicate opening turns when React StrictMode opens two sockets
const openingTurnInFlight = new Set<string>();
const turnInFlight = new Set<string>();

function isClientVoiceMessage(value: unknown): value is ClientVoiceMessage {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "START_SESSION" ||
    type === "STOP_SESSION" ||
    type === "BARGE_IN" ||
    type === "AUDIO_PLAYBACK_DONE"
  );
}

async function loadOrCreateInterviewState(
  interviewId: string,
  profile: CandidateProfile,
): Promise<InterviewState> {
  const latestSnapshot = await prisma.interviewStateSnapshot.findFirst({
    where: { interviewId },
    orderBy: { version: "desc" },
  });

  return latestSnapshot
    ? (latestSnapshot.state as InterviewState)
    : createInitialState(profile);
}

function sendJson(ws: WebSocket, event: VoiceEvent): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendBinary(ws: WebSocket, audio: Buffer): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(audio);
  }
}

export function attachVoiceGateway(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    let asr: DeepgramLiveAsr | null = null;

    try {
      const url = new URL(req.url ?? "", "http://localhost");

      if (!url.pathname.startsWith("/ws/interview/")) {
        ws.close();
        return;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const interviewId = parts[2] ?? "";

      if (!interviewId) {
        sendJson(ws, { type: "ERROR", message: "Missing interview id in URL" });
        ws.close();
        return;
      }

      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });

      if (!interview) {
        sendJson(ws, { type: "ERROR", message: "Interview not found" });
        ws.close();
        return;
      }

      let profile: CandidateProfile;
      try {
        profile = CandidateProfile.parse(interview.profile);
      } catch {
        sendJson(ws, { type: "ERROR", message: "Invalid candidate profile" });
        ws.close();
        return;
      }

      const interviewState = await loadOrCreateInterviewState(
        interviewId,
        profile,
      );

      const session = new InterviewSession({
        interviewId,
        interviewState,
        emit: (event) => sendJson(ws, event),
      });

      asr = new DeepgramLiveAsr({
        onPartial: (text) => {
          if (session.state === "LISTENING") {
            session.transition("CANDIDATE_SPEAKING");
          }
          session.setPartialTranscript(text);
        },
        onFinal: (text) => {
          const trimmed = text.trim();
          if (trimmed.length < 3) return;
        
          if (
            session.state !== "LISTENING" &&
            session.state !== "CANDIDATE_SPEAKING"
          ) {
            return;
          }
        
          if (turnInFlight.has(interviewId)) return;
          turnInFlight.add(interviewId);
        
          session.onFinalTranscript(trimmed);
        
          void runInterviewTurn({
            interviewId,
            profile,
            session,
            candidateText: trimmed,
            sendBinary: (audio) => sendBinary(ws, audio),
          })
            .catch((err) => {
              console.error("runInterviewTurn failed", err);
              sendJson(ws, {
                type: "ERROR",
                message: "Failed to generate interview turn",
              });
              session.transition("LISTENING");
            })
            .finally(() => {
              turnInFlight.delete(interviewId);
            });
        },
        onError: (err) => {
          console.error("deepgram live asr error", err);
          sendJson(ws, { type: "ERROR", message: err.message });
        },
      });

      try {
        await asr.connect();
      } catch (err) {
        console.error("failed to connect deepgram live asr", err);
        sendJson(ws, { type: "ERROR", message: "Failed to start live ASR" });
        ws.close();
        return;
      }

      session.start();

      // AI speaks first when this interview has no messages yet
      void (async () => {
        try {
          const priorCount = await prisma.message.count({
            where: { interviewId },
          });
          if (priorCount > 0) return;
          if (openingTurnInFlight.has(interviewId)) return;

          openingTurnInFlight.add(interviewId);

          session.transition("PROCESSING");
          await runInterviewTurn({
            interviewId,
            profile,
            session,
            candidateText: "[SESSION_START]",
            sendBinary: (audio) => sendBinary(ws, audio),
          });
        } catch (err) {
          console.error("opening turn failed", err);
          sendJson(ws, {
            type: "ERROR",
            message: "Failed to start interview",
          });
          session.transition("LISTENING");
        } finally {
          openingTurnInFlight.delete(interviewId);
        }
      })();

      ws.on("message", (data, isBinary) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data as ArrayBuffer);

          if (buf.byteLength === 0) return;

          if (
            session.state === "LISTENING" ||
            session.state === "CANDIDATE_SPEAKING"
          ) {
            asr?.sendPcm(buf);
          }
          return;
        }

        try {
          const parsed: unknown = JSON.parse(data.toString("utf8"));
          if (isClientVoiceMessage(parsed)) {
            if (parsed.type === "AUDIO_PLAYBACK_DONE") {
              session.onPlaybackFinished();
              return;
            }
            session.handleClientMessage(parsed);
            return;
          }
        } catch (err) {
          console.error(err);
          sendJson(ws, { type: "ERROR", message: "Invalid JSON message" });
        }
      });

      ws.on("close", () => {
        asr?.close();
        session.shutdown();
      });

      ws.on("error", (err) => {
        console.error("voice ws error", err);
        asr?.close();
        session.shutdown();
      });
    } catch (err) {
      console.error("voice gateway connection failed", err);
      sendJson(ws, {
        type: "ERROR",
        message: "Server error during session setup",
      });
      asr?.close();
      ws.close();
    }
  });

  console.log("Voice WebSocket gateway on /ws/interview/:id");
}