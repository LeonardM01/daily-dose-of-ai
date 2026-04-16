-- CreateEnum
CREATE TYPE "GenerationAttemptStage" AS ENUM ('RANKING', 'SCRIPT_TRANSCRIPT', 'SCRIPT_SSML');

-- CreateEnum
CREATE TYPE "GenerationAttemptStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "GenerationAttempt" (
    "id" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "stage" "GenerationAttemptStage" NOT NULL,
    "status" "GenerationAttemptStatus" NOT NULL,
    "prompt" TEXT,
    "response" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationAttempt_jobRunId_stage_createdAt_idx" ON "GenerationAttempt"("jobRunId", "stage", "createdAt");

-- AddForeignKey
ALTER TABLE "GenerationAttempt" ADD CONSTRAINT "GenerationAttempt_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
