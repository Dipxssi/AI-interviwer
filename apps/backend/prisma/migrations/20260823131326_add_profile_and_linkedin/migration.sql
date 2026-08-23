/*
  Warnings:

  - You are about to drop the column `githubMetadata` on the `Interview` table. All the data in the column will be lost.
  - Added the required column `linkedinUrl` to the `Interview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `profile` to the `Interview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Interview" DROP COLUMN "githubMetadata",
ADD COLUMN     "linkedinUrl" TEXT NOT NULL,
ADD COLUMN     "profile" JSONB NOT NULL;
