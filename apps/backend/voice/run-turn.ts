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

  const recentMessages = interview.conversation.slice(-6).map((m) => ({
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
    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "Done" },
    });
  }

  if (signal?.aborted || llmAbort.signal.aborted) {
    return;
  }

  session.setInterviewState(result.nextState);
  session.transition("AI_SPEAKING");

  const ttsAbort = session.beginTts();
  await logEvent(interviewId, assistantMsg.id, "TTS_STARTED");
  const sentences = splitIntoSentences(result.spoken_response);
  let firstChunk = true;

  for (const sentence of sentences) {
    if (ttsAbort.signal.aborted || llmAbort.signal.aborted) return;
    if (!firstChunk) {
      session.nextTtsSequence();
    }
    firstChunk = false;
    const audio = await synthesizeSpeech(sentence);
    if (ttsAbort.signal.aborted) return;
    sendBinary(audio);
  }

  session.emitAssistantText(result.spoken_response);
  session.onAssistantAudioSent();
}