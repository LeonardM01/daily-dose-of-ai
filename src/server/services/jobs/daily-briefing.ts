import { randomUUID } from "crypto";

import { Prisma, type TrendingSource } from "../../../../generated/prisma";
import { ensureDefaultFeeds } from "~/server/data/default-feeds";
import { db } from "~/server/db";
import { env } from "~/env";
import {
  generateBriefingScript,
  generateBriefingSsml,
  humanizeTranscript,
  type ScriptAttemptRecorder,
} from "~/server/services/briefing/generate-script";
import { storeBriefingAudio } from "~/server/services/briefing/store-audio";
import { synthesizeChirpHd } from "~/server/services/briefing/synthesize-audio";
import { ingestAllEnabledFeeds } from "~/server/services/news/ingest";
import {
  selectTopClusters,
  type Candidate,
  type CandidateSourceKind,
  type ScoredCluster,
} from "~/server/services/news/score-rank";
import { runTrendingSnapshot } from "~/server/services/trending/snapshot";

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

type AttemptStage =
  | "RANKING"
  | "SCRIPT_TRANSCRIPT"
  | "SCRIPT_HUMANIZE"
  | "SCRIPT_SSML";
type AttemptStatus = "SUCCESS" | "FAILED";

async function recordGenerationAttempt(params: {
  jobRunId: string;
  stage: AttemptStage;
  status: AttemptStatus;
  prompt: string;
  response?: string;
  error?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.generationAttempt
    .create({
      data: {
        jobRunId: params.jobRunId,
        stage: params.stage,
        status: params.status,
        prompt: params.prompt,
        response: params.response,
        error: params.error,
        metadata: params.metadata,
      },
    })
    .catch((error: unknown) => {
      console.error("[daily-briefing] failed to record generation attempt", {
        jobRunId: params.jobRunId,
        stage: params.stage,
        error: error instanceof Error ? error.message : String(error),
      });
    });
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

function trendingSourceLabel(
  source: TrendingSource,
  subsource: string | null,
): string {
  switch (source) {
    case "HACKER_NEWS":
      return "Hacker News";
    case "PRODUCT_HUNT":
      return "Product Hunt";
    case "GITHUB":
      return "GitHub Trending";
    case "REDDIT":
      return subsource ? `Reddit (${subsource})` : "Reddit";
  }
}

function buildReason(
  cluster: ScoredCluster,
  trendingItemById: Map<string, { source: TrendingSource; score: number | null; commentCount: number | null; subsource: string | null }>,
): string {
  const trending = trendingItemById.get(cluster.representativeArticleId);
  if (!trending) {
    return `Primary source: ${cluster.sourceNames.join(", ")}.`;
  }
  const score = trending.score ?? 0;
  const comments = trending.commentCount ?? 0;
  switch (trending.source) {
    case "HACKER_NEWS":
      return `Trending on Hacker News — ${score} points, ${comments} comments.`;
    case "PRODUCT_HUNT":
      return `Trending on Product Hunt — ${score} upvotes.`;
    case "GITHUB":
      return `Trending on GitHub — ${score} stars today.`;
    case "REDDIT":
      return `Trending on Reddit${trending.subsource ? ` (${trending.subsource})` : ""} — ${score} upvotes.`;
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
      regenerated?: boolean;
    }
  | { ok: false; error: string };

export type RunDailyBriefingPipelineOptions = {
  forceRegenerate?: boolean;
};

export async function runDailyBriefingPipeline(
  options?: RunDailyBriefingPipelineOptions,
): Promise<RunDailyBriefingResult> {
  const forceRegenerate = options?.forceRegenerate === true;
  const briefingDate = utcStartOfDay();
  const dateLabel = formatBriefingDateLabel(briefingDate);

  const existing = await db.dailyBriefing.findUnique({
    where: { briefingDate },
  });
  if (existing?.status === "COMPLETED" && !forceRegenerate) {
    return { ok: true, skipped: true, reason: "Briefing already completed for this day." };
  }

  const lock = await acquireJobLock(briefingDate);
  if (!lock.ok) {
    return lock.result;
  }

  const rowToReset = await db.dailyBriefing.findUnique({
    where: { briefingDate },
  });
  let regeneratedExisting = false;
  if (forceRegenerate && rowToReset) {
    regeneratedExisting = true;
    await db.$transaction([
      db.briefingSource.deleteMany({ where: { briefingId: rowToReset.id } }),
      db.dailyBriefing.update({
        where: { id: rowToReset.id },
        data: {
          title: `Generating — ${dateLabel}`,
          script: "",
          transcript: null,
          audioUrl: null,
          durationSeconds: null,
          status: "GENERATING",
          errorMessage: null,
        },
      }),
    ]);
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
  const recordAttempt: ScriptAttemptRecorder = async (attempt) => {
    await recordGenerationAttempt({
      jobRunId: jobRun.id,
      stage: attempt.stage,
      status: attempt.status,
      prompt: attempt.prompt,
      response: attempt.response,
      error: attempt.error,
      metadata: attempt.metadata as Prisma.InputJsonValue | undefined,
    });
  };

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
      update: forceRegenerate
        ? {
            title: `Generating — ${dateLabel}`,
            script: "",
            transcript: null,
            audioUrl: null,
            durationSeconds: null,
            status: "GENERATING",
            errorMessage: null,
          }
        : {
            status: "GENERATING",
            errorMessage: null,
          },
    });

    // Refresh today's trending snapshot before consuming it (chains the
    // standalone 23:00 UTC trending cron so the briefing always has fresh data).
    const trendingSnapshotResult = await runTrendingSnapshot();
    if (!trendingSnapshotResult.ok) {
      console.warn("[daily-briefing] trending snapshot refresh failed", {
        error: trendingSnapshotResult.error,
      });
    }

    await ensureDefaultFeeds(db);
    const ingest = await ingestAllEnabledFeeds(db);
    if (ingest.errors.length) {
      console.warn("[ingest] feed errors", ingest.errors);
    }

    // Curated RSS pool: last 48h from enabled feeds only.
    // Firehose feeds (dev.to, Medium, HN RSS, TechCrunch) are disabled in
    // default-feeds.ts; only low-volume primary-source feeds remain active.
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const curatedArticles = await db.sourceArticle.findMany({
      where: {
        OR: [{ publishedAt: { gte: since } }, { createdAt: { gte: since } }],
        feed: { enabled: true },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    // Today's trending items (refreshed above).
    const todaySnapshot = await db.trendingSnapshot.findUnique({
      where: { snapshotDate: briefingDate },
      include: { items: { orderBy: { rank: "asc" } } },
    });
    const trendingItems = todaySnapshot?.items ?? [];

    const SOURCE_KIND: Record<TrendingSource, CandidateSourceKind> = {
      HACKER_NEWS: "HN",
      PRODUCT_HUNT: "PH",
      GITHUB: "GH",
      REDDIT: "REDDIT",
    };

    const trendingCandidates: Candidate[] = trendingItems.map((it) => ({
      id: `trending:${it.id}`,
      title: it.title,
      url: it.url,
      sourceName: trendingSourceLabel(it.source, it.subsource),
      excerpt: it.description,
      publishedAt: it.createdAt,
      sourceKind: SOURCE_KIND[it.source],
      engagement: it.score ?? 0,
    }));

    const rssCandidates: Candidate[] = curatedArticles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      sourceName: a.sourceName,
      excerpt: a.excerpt,
      publishedAt: a.publishedAt ?? a.createdAt,
      sourceKind: "RSS" as const,
      engagement: 0,
    }));

    const clusters = selectTopClusters(
      [...trendingCandidates, ...rssCandidates],
      { topN: 12 },
    );

    if (clusters.length === 0) {
      throw new Error(
        "No stories selected after scoring. Try again after feeds populate.",
      );
    }

    const trendingItemById = new Map(
      trendingItems.map((it) => [`trending:${it.id}`, it]),
    );
    const rssIdSet = new Set(rssCandidates.map((c) => c.id));

    const stories = clusters.map((cluster) => ({
      articleId: cluster.representativeArticleId,
      // Only persist SourceArticle IDs — trending items have no SourceArticle row.
      articleIds: cluster.articleIds.filter((id) => rssIdSet.has(id)),
      reason: buildReason(cluster, trendingItemById),
      title: cluster.title,
      url: cluster.primaryUrl,
      sourceName: cluster.sourceNames[0] ?? "Unknown source",
      sourceNames: cluster.sourceNames,
      supportingLinks: cluster.supportingLinks,
      excerpt: cluster.excerpt,
    })) as Parameters<typeof generateBriefingScript>[1];

    const {
      title,
      script,
      tokensInput: tsIn,
      tokensOutput: tsOut,
    } = await generateBriefingScript(googleAiKey, stories, dateLabel, recordAttempt);
    tokensInputTotal += tsIn;
    tokensOutputTotal += tsOut;

    const {
      transcript: humanizedScript,
      tokensInput: hIn,
      tokensOutput: hOut,
    } = await humanizeTranscript(googleAiKey, script, recordAttempt);
    tokensInputTotal += hIn;
    tokensOutputTotal += hOut;

    const {
      ssml,
      tokensInput: ssmlIn,
      tokensOutput: ssmlOut,
    } = await generateBriefingSsml(googleAiKey, humanizedScript, dateLabel, recordAttempt);
    tokensInputTotal += ssmlIn;
    tokensOutputTotal += ssmlOut;

    const { audioBuffer, characterCount, fileExtension, contentType } =
      await synthesizeChirpHd(gcpJson, ssml, { briefingDate });
    ttsChars = characterCount;

    const briefingRow = await db.dailyBriefing.findUnique({
      where: { briefingDate },
    });
    if (!briefingRow) throw new Error("Briefing row missing after upsert");

    const audioUrl = await storeBriefingAudio(dateLabel, audioBuffer, {
      extension: fileExtension,
      contentType,
    });

    const wordCount = humanizedScript.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(60, Math.round((wordCount / 140) * 60));

    await db.$transaction([
      db.dailyBriefing.update({
        where: { id: briefingRow.id },
        data: {
          title,
          script: ssml,
          transcript: humanizedScript,
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
      ...(regeneratedExisting ? { regenerated: true } : {}),
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
