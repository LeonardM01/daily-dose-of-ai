import { randomUUID } from "crypto";

import { Prisma } from "../../../../generated/prisma";
import { ensureDefaultFeeds } from "~/server/data/default-feeds";
import { db } from "~/server/db";
import { env } from "~/env";
import { generateBriefingScript } from "~/server/services/briefing/generate-script";
import { storeBriefingAudio } from "~/server/services/briefing/store-audio";
import { synthesizeChirpHd } from "~/server/services/briefing/synthesize-audio";
import {
  clusterArticles,
  rankStoriesWithGemini,
  type ArticleForRank,
} from "~/server/services/news/dedupe-rank";
import { ingestAllEnabledFeeds } from "~/server/services/news/ingest";

export function utcStartOfDay(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function formatBriefingDateLabel(day: Date): string {
  return day.toISOString().slice(0, 10);
}

const JOB_LOCK_STALE_AFTER_MS = 15 * 60 * 1000;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function releaseJobLock(briefingDate: Date): Promise<void> {
  await db.jobLock.delete({ where: { briefingDate } }).catch((error: unknown) => {
    console.error("[daily-briefing] failed to release job lock", {
      briefingDate: briefingDate.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function isStaleJobLock(lockedAt: Date): boolean {
  return Date.now() - lockedAt.getTime() > JOB_LOCK_STALE_AFTER_MS;
}

async function acquireJobLock(
  briefingDate: Date,
): Promise<
  | { ok: true }
  | { ok: false; result: RunDailyBriefingResult }
> {
  try {
    await db.jobLock.create({
      data: {
        briefingDate,
        runId: randomUUID(),
      },
    });
    return { ok: true };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        result: {
          ok: false,
          error: `Failed to acquire job lock: ${message}`,
        },
      };
    }
  }

  try {
    const existingLock = await db.jobLock.findUnique({
      where: { briefingDate },
    });

    if (!existingLock) {
      return {
        ok: false,
        result: {
          ok: true,
          skipped: true,
          reason: "Another generation run is in progress for this day.",
        },
      };
    }

    if (!isStaleJobLock(existingLock.lockedAt)) {
      return {
        ok: false,
        result: {
          ok: true,
          skipped: true,
          reason: "Another generation run is in progress or the lock exists for this day.",
        },
      };
    }

    const reclaimed = await db.jobLock.deleteMany({
      where: {
        briefingDate,
        runId: existingLock.runId,
        lockedAt: existingLock.lockedAt,
      },
    });

    if (reclaimed.count === 0) {
      return {
        ok: false,
        result: {
          ok: true,
          skipped: true,
          reason: "Another generation run is in progress for this day.",
        },
      };
    }

    await db.jobLock.create({
      data: {
        briefingDate,
        runId: randomUUID(),
      },
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return {
        ok: false,
        result: {
          ok: true,
          skipped: true,
          reason: "Another generation run claimed the briefing after stale lock recovery.",
        },
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: {
        ok: false,
        error: `Failed to acquire job lock after stale lock recovery: ${message}`,
      },
    };
  }
}

export type RunDailyBriefingResult =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      skipped: false;
      briefingId: string;
      audioUrl: string;
      jobRunId: string;
    }
  | { ok: false; error: string };

export async function runDailyBriefingPipeline(): Promise<RunDailyBriefingResult> {
  const briefingDate = utcStartOfDay();
  const dateLabel = formatBriefingDateLabel(briefingDate);

  const existing = await db.dailyBriefing.findUnique({
    where: { briefingDate },
  });
  if (existing?.status === "COMPLETED") {
    return { ok: true, skipped: true, reason: "Briefing already completed for this day." };
  }

  const lock = await acquireJobLock(briefingDate);
  if (!lock.ok) {
    return lock.result;
  }

  const idempotencyKey = `daily-${dateLabel}-${randomUUID()}`;
  let jobRun: { id: string };
  try {
    jobRun = await db.jobRun.create({
      data: {
        briefingDate,
        status: "STARTED",
        idempotencyKey,
      },
    });
  } catch (e) {
    await releaseJobLock(briefingDate);
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to create job run: ${message}` };
  }

  let tokensInputTotal = 0;
  let tokensOutputTotal = 0;
  let ttsChars = 0;

  try {
    if (!env.GOOGLE_AI_API_KEY || !env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON) {
      throw new Error(
        "Missing GOOGLE_AI_API_KEY or GOOGLE_TTS_SERVICE_ACCOUNT_JSON in environment.",
      );
    }

    const googleAiKey = env.GOOGLE_AI_API_KEY;
    const gcpJson = env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;

    await db.dailyBriefing.upsert({
      where: { briefingDate },
      create: {
        briefingDate,
        title: `Generating — ${dateLabel}`,
        script: "",
        status: "GENERATING",
      },
      update: {
        status: "GENERATING",
        errorMessage: null,
      },
    });

    await ensureDefaultFeeds(db);
    const ingest = await ingestAllEnabledFeeds(db);
    if (ingest.errors.length) {
      console.warn("[ingest] feed errors", ingest.errors);
    }

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const rawArticles = await db.sourceArticle.findMany({
      where: {
        OR: [
          { publishedAt: { gte: since } },
          { createdAt: { gte: since } },
        ],
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 400,
    });

    const forRank: ArticleForRank[] = rawArticles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      sourceName: a.sourceName,
      excerpt: a.excerpt,
    }));

    const clusters = clusterArticles(forRank);
    const { ranked, tokensInput: trIn, tokensOutput: trOut } =
      await rankStoriesWithGemini(googleAiKey, clusters);
    tokensInputTotal += trIn;
    tokensOutputTotal += trOut;

    const clustersById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const stories = ranked
      .map((r) => {
        const cluster = clustersById.get(r.clusterId);
        if (!cluster) return null;
        return {
          articleId: cluster.representativeArticleId,
          articleIds: cluster.articleIds,
          reason: r.reason,
          title: cluster.title,
          url: cluster.primaryUrl,
          sourceName: cluster.sourceNames[0] ?? "Unknown source",
          sourceNames: cluster.sourceNames,
          supportingLinks: cluster.supportingLinks,
          excerpt: cluster.excerpt,
        };
      })
      .filter(Boolean) as Parameters<typeof generateBriefingScript>[1];

    if (stories.length === 0) {
      throw new Error("No stories selected after ranking. Try again after feeds populate.");
    }

    const {
      title,
      script,
      ssml,
      tokensInput: tsIn,
      tokensOutput: tsOut,
    } = await generateBriefingScript(googleAiKey, stories, dateLabel);
    tokensInputTotal += tsIn;
    tokensOutputTotal += tsOut;

    const { audioBuffer, characterCount, fileExtension, contentType } =
      await synthesizeChirpHd(gcpJson, ssml);
    ttsChars = characterCount;

    const briefingRow = await db.dailyBriefing.findUnique({
      where: { briefingDate },
    });
    if (!briefingRow) throw new Error("Briefing row missing after upsert");

    const audioUrl = await storeBriefingAudio(dateLabel, audioBuffer, {
      extension: fileExtension,
      contentType,
    });

    const wordCount = script.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(60, Math.round((wordCount / 140) * 60));

    await db.$transaction([
      db.dailyBriefing.update({
        where: { id: briefingRow.id },
        data: {
          title,
          script,
          transcript: script,
          audioUrl,
          status: "COMPLETED",
          durationSeconds,
          errorMessage: null,
        },
      }),
      db.briefingSource.deleteMany({ where: { briefingId: briefingRow.id } }),
      db.briefingSource.createMany({
        data: [...new Set(stories.flatMap((s) => s.articleIds))].map((articleId) => ({
          briefingId: briefingRow.id,
          articleId,
        })),
        skipDuplicates: true,
      }),
      db.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          briefingId: briefingRow.id,
          tokensInput: tokensInputTotal,
          tokensOutput: tokensOutputTotal,
          ttsCharacters: ttsChars,
        },
      }),
    ]);

    return {
      ok: true,
      skipped: false,
      briefingId: briefingRow.id,
      audioUrl,
      jobRunId: jobRun.id,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.dailyBriefing
      .updateMany({
        where: { briefingDate },
        data: {
          status: "FAILED",
          errorMessage: message,
        },
      })
      .catch(() => undefined);

    await db.jobRun
      .update({
        where: { id: jobRun.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: message,
          tokensInput: tokensInputTotal,
          tokensOutput: tokensOutputTotal,
          ttsCharacters: ttsChars,
        },
      })
      .catch(() => undefined);

    return { ok: false, error: message };
  } finally {
    await releaseJobLock(briefingDate);
  }
}
