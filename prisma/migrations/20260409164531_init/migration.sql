-- CreateEnum
CREATE TYPE "BriefingStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "OwnerSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAiApiKeyEncrypted" TEXT,
    "gcpServiceAccountEncrypted" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "preferredRunHour" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFeed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceArticle" (
    "id" TEXT NOT NULL,
    "feedId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "excerpt" TEXT,
    "contentHash" TEXT,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "briefingDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "transcript" TEXT,
    "audioUrl" TEXT,
    "status" "BriefingStatus" NOT NULL DEFAULT 'PENDING',
    "durationSeconds" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSource" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "BriefingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "briefingDate" TIMESTAMP(3) NOT NULL,
    "status" "JobRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "ttsCharacters" INTEGER,
    "briefingId" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "briefingDate" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("briefingDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSettings_userId_key" ON "OwnerSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFeed_url_key" ON "SourceFeed"("url");

-- CreateIndex
CREATE UNIQUE INDEX "SourceArticle_url_key" ON "SourceArticle"("url");

-- CreateIndex
CREATE INDEX "DailyBriefing_briefingDate_idx" ON "DailyBriefing"("briefingDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_briefingDate_key" ON "DailyBriefing"("briefingDate");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingSource_briefingId_articleId_key" ON "BriefingSource"("briefingId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRun_briefingDate_idx" ON "JobRun"("briefingDate");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSettings" ADD CONSTRAINT "OwnerSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceArticle" ADD CONSTRAINT "SourceArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "SourceFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSource" ADD CONSTRAINT "BriefingSource_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "DailyBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSource" ADD CONSTRAINT "BriefingSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "SourceArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "DailyBriefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
