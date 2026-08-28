import { prisma } from "../db";
import type { CandidateProfile } from "../types";
import { generateTurn } from "../interview-engine/generate-turn";
import { synthesizeSpeech } from "../services/tts-deepgram";
import type { InterviewSession } from "./session";

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
    await prisma.message.create({
      data: {
        interviewId,
        type: "USER",
        message: text,
      },
    });
  }

  await prisma.message.create({
    data: {
      interviewId,
      type: "ASSISTANT",
      message: result.spoken_response,
      metadata: result.decision,
    },
  });

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

  session.setInterviewState(result.nextState);
  session.transition("AI_SPEAKING");
  
  const ttsAbort = session.beginTts();
  const audio = await synthesizeSpeech(result.spoken_response);
  
  if (signal?.aborted || ttsAbort.signal.aborted) {
    return;
  }
  
  session.emitAssistantText(result.spoken_response);
  sendBinary(audio);
  session.onAssistantAudioSent();
}