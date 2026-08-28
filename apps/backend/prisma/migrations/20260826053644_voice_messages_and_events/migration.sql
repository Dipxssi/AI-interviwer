-- CreateEnum
CREATE TYPE "RealtimeEventType" AS ENUM ('AUDIO_STARTED', 'AUDIO_ENDED', 'FINAL_TRANSCRIPT', 'ENDPOINT_CONFIRMED', 'LLM_STARTED', 'LLM_FIRST_TOKEN', 'TTS_STARTED', 'TTS_FIRST_AUDIO', 'ASSISTANT_INTERRUPTED', 'INTERVIEW_DECISION');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'SYSTEM';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "RealtimeEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStateSnapshot" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealtimeEvent_interviewId_timestamp_idx" ON "RealtimeEvent"("interviewId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewStateSnapshot_interviewId_version_key" ON "InterviewStateSnapshot"("interviewId", "version");

-- AddForeignKey
ALTER TABLE "RealtimeEvent" ADD CONSTRAINT "RealtimeEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
