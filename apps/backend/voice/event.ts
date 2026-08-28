import { prisma } from "../db";
import type { RealtimeEventType } from "../generated/prisma/client";

export async function logEvent(
  interviewId: string,
  messageId: string,
  type: RealtimeEventType,
  payload?: Record<string, unknown>,
): Promise<void> {
  await prisma.realtimeEvent.create({
    data: {
      interviewId,
      messageId,
      type,
      timestamp: new Date(),
      payload: payload ?? undefined,
    },
  });
}