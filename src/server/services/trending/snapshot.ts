import type { Prisma, TrendingSource } from "../../../../generated/prisma";
import { db } from "~/server/db";
import { utcStartOfDay } from "~/server/services/jobs/daily-briefing";
import { getSafeHttpUrl } from "~/lib/safe-external-url";

import { fetchHackerNews } from "./fetch-hn";
import { fetchReddit } from "./fetch-reddit";
import { fetchProductHunt } from "./fetch-producthunt";
import { fetchGithubTrending } from "./fetch-github";
import type { FetchResult, FetchedTrendingItem } from "./types";

export type RunTrendingSnapshotResult =
  | {
      ok: true;
      snapshotId: string;
      snapshotDate: string;
      itemsBySource: Record<string, number>;
      errors: Array<{ source: string; error: string }>;
    }
  | { ok: false; error: string };

type FetcherEntry = {
  source: TrendingSource;
  run: () => Promise<FetchResult>;
};

const FETCHERS: FetcherEntry[] = [
  { source: "HACKER_NEWS", run: fetchHackerNews },
  { source: "REDDIT", run: fetchReddit },
  { source: "PRODUCT_HUNT", run: fetchProductHunt },
  { source: "GITHUB", run: fetchGithubTrending },
];

function sanitizeItem(item: FetchedTrendingItem): FetchedTrendingItem | null {
  const safeUrl = getSafeHttpUrl(item.url);
  if (!safeUrl) return null;
  const safeThumb = item.thumbnailUrl
    ? getSafeHttpUrl(item.thumbnailUrl)
    : null;
  return {
    ...item,
    url: safeUrl,
    thumbnailUrl: safeThumb,
  };
}

export async function runTrendingSnapshot(): Promise<RunTrendingSnapshotResult> {
  const snapshotDate = utcStartOfDay();

  const snapshot = await db.trendingSnapshot.upsert({
    where: { snapshotDate },
    create: {
      snapshotDate,
      status: "GENERATING",
    },
    update: {
      status: "GENERATING",
      errorMessage: null,
    },
  });

  const settled = await Promise.allSettled(
    FETCHERS.map(async (f) => ({ source: f.source, result: await f.run() })),
  );

  const errors: Array<{ source: string; error: string }> = [];
  const successful: Array<{
    source: TrendingSource;
    items: FetchedTrendingItem[];
  }> = [];

  settled.forEach((res, idx) => {
    const fetcher = FETCHERS[idx]!;
    if (res.status === "fulfilled") {
      successful.push({
        source: fetcher.source,
        items: res.value.result.items,
      });
    } else {
      const err =
        res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.error("[trending] fetcher failed", { source: fetcher.source, err });
      errors.push({ source: fetcher.source, error: err });
    }
  });

  const itemsBySource: Record<string, number> = {};
  try {
    await db.$transaction(async (tx) => {
      await tx.trendingItem.deleteMany({
        where: { snapshotId: snapshot.id },
      });

      for (const { source, items } of successful) {
        const unique = new Map<string, FetchedTrendingItem>();
        for (const it of items) {
          const sanitized = sanitizeItem(it);
          if (!sanitized) continue;
          if (!unique.has(sanitized.externalId)) {
            unique.set(sanitized.externalId, sanitized);
          }
        }
        const rows = [...unique.values()].map((it, idx) => ({
          snapshotId: snapshot.id,
          source: it.source,
          externalId: it.externalId,
          rank: idx + 1,
          title: it.title,
          url: it.url,
          description: it.description,
          score: it.score,
          commentCount: it.commentCount,
          author: it.author,
          subsource: it.subsource,
          thumbnailUrl: it.thumbnailUrl,
          metadata: (it.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        }));
        if (rows.length > 0) {
          await tx.trendingItem.createMany({ data: rows });
        }
        itemsBySource[source] = rows.length;
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.trendingSnapshot
      .update({
        where: { id: snapshot.id },
        data: { status: "FAILED", errorMessage: message },
      })
      .catch(() => undefined);
    return { ok: false, error: message };
  }

  const totalSources = FETCHERS.length;
  const successCount = successful.filter(
    (s) => (itemsBySource[s.source] ?? 0) > 0,
  ).length;
  const status =
    successCount === 0
      ? "FAILED"
      : successCount < totalSources
        ? "PARTIAL"
        : "COMPLETED";

  await db.trendingSnapshot.update({
    where: { id: snapshot.id },
    data: {
      status,
      errorMessage: errors.length
        ? errors.map((e) => `${e.source}: ${e.error}`).join("; ")
        : null,
    },
  });

  return {
    ok: true,
    snapshotId: snapshot.id,
    snapshotDate: snapshotDate.toISOString().slice(0, 10),
    itemsBySource,
    errors,
  };
}
