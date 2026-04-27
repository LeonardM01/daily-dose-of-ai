import type { PrismaClient } from "../../../generated/prisma";

/**
 * Curated RSS feeds for the daily briefing pipeline.
 *
 * Source policy: the briefing's primary candidate pool comes from the
 * trending snapshot (HN top, Product Hunt, GitHub trending, Reddit). RSS
 * here supplements with low-volume, high-signal primary-source coverage
 * (official Claude/Google/YC posts). High-volume firehose feeds (dev.to,
 * Medium, HN Newest/Front, TechCrunch AI) are kept in this list with
 * `enabled: false` so they remain disabled across re-seeds.
 */
export const DEFAULT_FEEDS: {
  name: string;
  url: string;
  category: string | null;
  enabled?: boolean;
}[] = [
  {
    name: "Anthropic — Newsroom",
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/refs/heads/main/feeds/feed_anthropic.xml",
    category: "official",
  },
  {
    name: "Anthropic — Research",
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/refs/heads/main/feeds/feed_anthropic_research.xml",
    category: "official",
  },
  {
    name: "Hacker News — Front page",
    url: "https://news.ycombinator.com/rss",
    category: "community",
    enabled: false,
  },
  {
    name: "Hacker News — Newest",
    url: "https://hnrss.org/newest",
    category: "community",
    enabled: false,
  },
  {
    name: "DEV — tag ai",
    url: "https://dev.to/feed/tag/ai",
    category: "dev",
    enabled: false,
  },
  {
    name: "DEV — tag programming",
    url: "https://dev.to/feed/tag/programming",
    category: "dev",
    enabled: false,
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    category: "official",
  },
  {
    name: "Medium — The Generator",
    url: "https://medium.com/feed/the-generator",
    category: "medium",
    enabled: false,
  },
  {
    name: "Medium — Towards AI",
    url: "https://pub.towardsai.net/feed",
    category: "medium",
    enabled: false,
  },
  {
    name: "Y Combinator Blog",
    url: "https://blog.ycombinator.com/rss/",
    category: "yc",
  },
  {
    name: "TechCrunch — AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "news",
    enabled: false,
  },
];

export async function ensureDefaultFeeds(db: PrismaClient): Promise<void> {
  await Promise.all(
    DEFAULT_FEEDS.map(async (feed) => {
      const enabled = feed.enabled ?? true;
      const existingByName = await db.sourceFeed.findFirst({
        where: { name: feed.name },
      });

      if (existingByName) {
        await db.sourceFeed.update({
          where: { id: existingByName.id },
          data: {
            url: feed.url,
            category: feed.category,
            enabled,
          },
        });
        return;
      }

      await db.sourceFeed.upsert({
        where: { url: feed.url },
        create: {
          name: feed.name,
          url: feed.url,
          category: feed.category,
          enabled,
        },
        update: {
          name: feed.name,
          category: feed.category,
          enabled,
        },
      });
    }),
  );
}
