-- CreateEnum
CREATE TYPE "TrendingSnapshotStatus" AS ENUM ('GENERATING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "TrendingSource" AS ENUM ('HACKER_NEWS', 'REDDIT', 'PRODUCT_HUNT', 'GITHUB');

-- CreateTable
CREATE TABLE "TrendingSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "status" "TrendingSnapshotStatus" NOT NULL DEFAULT 'GENERATING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingItem" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "source" "TrendingSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "score" INTEGER,
    "commentCount" INTEGER,
    "author" TEXT,
    "subsource" TEXT,
    "thumbnailUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendingSnapshot_snapshotDate_key" ON "TrendingSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "TrendingSnapshot_snapshotDate_idx" ON "TrendingSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "TrendingItem_snapshotId_source_externalId_key" ON "TrendingItem"("snapshotId", "source", "externalId");

-- CreateIndex
CREATE INDEX "TrendingItem_snapshotId_source_rank_idx" ON "TrendingItem"("snapshotId", "source", "rank");

-- AddForeignKey
ALTER TABLE "TrendingItem" ADD CONSTRAINT "TrendingItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrendingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
