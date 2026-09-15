import { prisma } from "../db";
import type { CandidateProfile } from "../types";
import { generateTurn } from "../interview-engine/generate-turn";
import { synthesizeSpeech } from "../services/tts-deepgram";
import type { InterviewSession } from "./session";
import { splitIntoSentences } from "./split-sentences";
import { logEvent } from "./event";

type RunTurnArgs = {
  interviewId: string;
  profile: CandidateProfile;
  session: InterviewSession;
  candidateText: string;
  sendBinary: (audio: Buffer) => void;
  signal?: AbortSignal;
};

export async function runInterviewTurn({
  interviewId,
  profile,
  session,
  candidateText,
  sendBinary,
  signal,
}: RunTurnArgs): Promise<void> {
  const text = candidateText.trim();
  if (!text) return;

  const isOpening = text === "[SESSION_START]";

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      conversation: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!interview) {
    throw new Error("Interview not found");
  }

  const recentMessages = interview.conversation.slice(-10).map((m) => ({
    role: (m.type === "USER" ? "user" : "assistant") as "user" | "assistant",
    text: m.message,
  }));

  const llmAbort = session.beginLlm();

  const result = await generateTurn({
    profile,
    state: session.interviewState,
    recentMessages,
    latestUserText: text,
  });

  if (signal?.aborted || llmAbort.signal.aborted) {
    return;
  }

  if (!isOpening) {
    const userMsg = await prisma.message.create({
      data: {
        interviewId,
        type: "USER",
        message: text,
      },
    });
    await logEvent(interviewId, userMsg.id, "FINAL_TRANSCRIPT");
  }

  const assistantMsg = await prisma.message.create({
    data: {
      interviewId,
      type: "ASSISTANT",
      message: result.spoken_response,
      metadata: result.decision,
    },
  });

  await logEvent(interviewId, assistantMsg.id, "LLM_STARTED");

  const latestSnapshot = await prisma.interviewStateSnapshot.findFirst({
    where: { interviewId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestSnapshot?.version ?? 0) + 1;

  await prisma.interviewStateSnapshot.create({
    data: {
      interviewId,
      version: nextVersion,
      state: result.nextState,
    },
  });

  if (interview.status === "Pre") {
    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "Inprogress" },
    });
  }

  if (result.nextState.shouldEnd) {
    session.setFinalScore(result.score);
    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "Done", score: result.score },
    });
  } else {
    session.setFinalScore(result.score);
  }

  if (signal?.aborted || llmAbort.signal.aborted) {
    return;
  }

  session.setInterviewState(result.nextState);
  // Keep PROCESSING until first TTS chunk is ready — avoids "speaking" with silence.
  session.emitAssistantText(result.spoken_response);

  const ttsAbort = session.beginTts();
  await logEvent(interviewId, assistantMsg.id, "TTS_STARTED");
  const sentences = splitIntoSentences(result.spoken_response);
  let firstChunk = true;
  let audioChunks = 0;

  try {
    for (const sentence of sentences) {
      if (ttsAbort.signal.aborted || llmAbort.signal.aborted) break;
      if (!firstChunk) {
        session.nextTtsSequence();
      }
      const audio = await synthesizeSpeech(sentence);
      if (ttsAbort.signal.aborted || llmAbort.signal.aborted) break;
      if (audio.byteLength === 0) continue;

      if (firstChunk) {
        session.transition("AI_SPEAKING");
        firstChunk = false;
      }
      sendBinary(audio);
      audioChunks += 1;
    }
  } catch (err) {
    console.error("TTS failed", err);
  }

  session.onAssistantAudioSent();

  // No playable audio → don't wait forever for AUDIO_PLAYBACK_DONE.
  if (audioChunks === 0 && !ttsAbort.signal.aborted && !llmAbort.signal.aborted) {
    session.transition("AI_SPEAKING");
    session.onPlaybackFinished();
  }
}