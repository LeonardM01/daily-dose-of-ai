import { createHash } from "crypto";

import Parser from "rss-parser";
import type { PrismaClient } from "../../../../generated/prisma";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "DailyDoseOfAI/1.0 (RSS ingest)",
  },
});

export type IngestResult = {
  feedsProcessed: number;
  articlesUpserted: number;
  errors: string[];
};

function hashContent(title: string, excerpt: string | undefined): string {
  return createHash("sha256")
    .update(`${title}\n${excerpt ?? ""}`)
    .digest("hex");
}

/** Coerce RSS date strings to a valid Date or null (never Invalid Date for Prisma). */
function parsePublishedAt(
  pubDate: string | undefined,
  isoDate: string | undefined,
): Date | null {
  const raw = pubDate ?? isoDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function ingestAllEnabledFeeds(db: PrismaClient): Promise<IngestResult> {
  const feeds = await db.sourceFeed.findMany({ where: { enabled: true } });
  const errors: string[] = [];
  let articlesUpserted = 0;

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items ?? []) {
        try {
          const link = item.link?.trim();
          if (!link) continue;
          const title = (item.title ?? "Untitled").slice(0, 500);
          const excerpt =
            item.contentSnippet ?? item.content ?? item.summary ?? undefined;
          const excerptShort = excerpt ? excerpt.slice(0, 8000) : undefined;
          const publishedAt = parsePublishedAt(item.pubDate, item.isoDate);
          const contentHash = hashContent(title, excerptShort);

          await db.sourceArticle.upsert({
            where: { url: link },
            create: {
              feedId: feed.id,
              url: link,
              title,
              sourceName: feed.name,
              publishedAt,
              excerpt: excerptShort,
              contentHash,
              rawContent: excerptShort,
            },
            update: {
              feedId: feed.id,
              title,
              excerpt: excerptShort,
              contentHash,
              rawContent: excerptShort,
              publishedAt: publishedAt ?? undefined,
              sourceName: feed.name,
            },
          });
          articlesUpserted += 1;
        } catch (e) {
          const titleHint = item.title ? ` (“${String(item.title).slice(0, 80)}…”)` : "";
          errors.push(
            `${feed.name}${titleHint}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } catch (e) {
      errors.push(
        `${feed.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    feedsProcessed: feeds.length,
    articlesUpserted,
    errors,
  };
}
