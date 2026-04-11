import type { PrismaClient } from "../../../generated/prisma";

/** Curated RSS feeds for the daily briefing pipeline (see project plan). */
export const DEFAULT_FEEDS: {
  name: string;
  url: string;
  category: string | null;
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
  },
  {
    name: "Hacker News — Newest",
    url: "https://hnrss.org/newest",
    category: "community",
  },
  { name: "DEV — tag ai", url: "https://dev.to/feed/tag/ai", category: "dev" },
  {
    name: "DEV — tag programming",
    url: "https://dev.to/feed/tag/programming",
    category: "dev",
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
  },
  {
    name: "Medium — Towards AI",
    url: "https://pub.towardsai.net/feed",
    category: "medium",
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
  },
];

export async function ensureDefaultFeeds(db: PrismaClient): Promise<void> {
  await Promise.all(
    DEFAULT_FEEDS.map(async (feed) => {
      const existingByName = await db.sourceFeed.findFirst({
        where: { name: feed.name },
      });

      if (existingByName) {
        await db.sourceFeed.update({
          where: { id: existingByName.id },
          data: {
            url: feed.url,
            category: feed.category,
            enabled: true,
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
          enabled: true,
        },
        update: {
          name: feed.name,
          category: feed.category,
          enabled: true,
        },
      });
    }),
  );
}
