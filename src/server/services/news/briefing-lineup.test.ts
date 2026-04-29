import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIEFING_LINEUP_QUOTAS,
  BRIEFING_MAX_HN_AFTER_FALLBACK,
  BRIEFING_TARGET_STORY_COUNT,
  assembleBriefingLineup,
  pickClustersWithDedupe,
} from "./briefing-lineup";
import { titlesLikelySameStory } from "./dedupe-rank";
import type { ScoredCluster } from "./score-rank";

function mockCluster(
  id: string,
  title: string,
  score = 1,
): ScoredCluster {
  return {
    id,
    articleIds: [id],
    representativeArticleId: id,
    title,
    primaryUrl: `https://example.com/${id}`,
    excerpt: null,
    sourceNames: ["Test"],
    supportingLinks: [
      {
        articleId: id,
        sourceName: "Test",
        title,
        url: `https://example.com/${id}`,
      },
    ],
    score,
  };
}

test("pickClustersWithDedupe skips titles that match prior picks", () => {
  const ranked = [
    mockCluster("a", "Unique alpha"),
    mockCluster("b", "Unique beta"),
    mockCluster("c", "Unique alpha remix"),
  ];
  const { picked, titles } = pickClustersWithDedupe(ranked, 2, []);
  assert.equal(picked.length, 2);
  assert.ok(titles.some((t) => titlesLikelySameStory(t, "Unique alpha")));
});

test("assembleBriefingLineup returns 14 clusters with full distinct pools", () => {
  const now = new Date();
  const mk = (prefix: string, n: number, kind: "GH" | "HN" | "RSS") =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      title: `${prefix} story ${i} ${Math.random().toString(36).slice(2)}`,
      url: `https://example.com/${prefix}/${i}`,
      sourceName: prefix,
      excerpt: "x".repeat(120),
      publishedAt: now,
      sourceKind: kind,
      engagement: kind === "GH" ? 500 - i : kind === "HN" ? 200 - i : 0,
    }));

  const github = mk("gh", 12, "GH");
  const hn = mk("hn", 12, "HN");
  const medium = mk("med", 12, "RSS");
  const devto = mk("dev", 8, "RSS");
  const tc = mk("tc", 8, "RSS");

  const { clusters, meta } = assembleBriefingLineup({
    github,
    hackerNews: hn,
    medium,
    devto,
    techcrunch: tc,
    now,
  });

  assert.equal(clusters.length, BRIEFING_TARGET_STORY_COUNT);
  assert.equal(meta.extraHackerNews, 0);
  assert.equal(meta.editorialFallbackArticles, 0);

  const ghIds = new Set(github.map((c) => c.id));
  const first3Gh = clusters.slice(0, BRIEFING_LINEUP_QUOTAS.github);
  for (const c of first3Gh) {
    assert.ok(ghIds.has(c.representativeArticleId));
  }
});

test("assembleBriefingLineup caps GitHub at 3", () => {
  const now = new Date();
  const github = Array.from({ length: 20 }, (_, i) => ({
    id: `gh-${i}`,
    title: `Graph neural nets for astrophysics batch ${i} uuid${i}f9`,
    url: `https://github.com/x/${i}`,
    sourceName: "GitHub Trending",
    excerpt: null,
    publishedAt: now,
    sourceKind: "GH" as const,
    engagement: 1000 - i,
  }));
  const hn = Array.from({ length: 10 }, (_, i) => ({
    id: `hn-${i}`,
    title: `hn ${i} yyy`,
    url: `https://news.ycombinator.com?id=${i}`,
    sourceName: "Hacker News",
    excerpt: null,
    publishedAt: now,
    sourceKind: "HN" as const,
    engagement: 100 - i,
  }));
  const rss = (p: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${p}-${i}`,
      title: `${p} ${i} www`,
      url: `https://example.com/${p}/${i}`,
      sourceName: p,
      excerpt: "abc",
      publishedAt: now,
      sourceKind: "RSS" as const,
      engagement: 0,
    }));

  const { clusters } = assembleBriefingLineup({
    github,
    hackerNews: hn,
    medium: rss("m", 10),
    devto: rss("d", 5),
    techcrunch: rss("t", 5),
    now,
  });

  const ghInLineup = clusters.filter((c) =>
    github.some((g) => g.id === c.representativeArticleId),
  );
  assert.equal(ghInLineup.length, BRIEFING_LINEUP_QUOTAS.github);
});

test("assembleBriefingLineup records shortfall when editorial pools are empty", () => {
  const now = new Date();
  const github = Array.from({ length: 3 }, (_, i) => ({
    id: `gh-${i}`,
    title: `GitHub momentum snapshot k9m${i}w`,
    url: `https://github.com/a/${i}`,
    sourceName: "GitHub Trending",
    excerpt: null,
    publishedAt: now,
    sourceKind: "GH" as const,
    engagement: 50,
  }));
  const hn = Array.from({ length: 10 }, (_, i) => ({
    id: `hn-${i}`,
    title: `YCombinator thread voltage q7n${i}z`,
    url: `https://hn.example/${i}`,
    sourceName: "Hacker News",
    excerpt: null,
    publishedAt: now,
    sourceKind: "HN" as const,
    engagement: 80 - i,
  }));

  const { clusters, meta } = assembleBriefingLineup({
    github,
    hackerNews: hn,
    medium: [],
    devto: [],
    techcrunch: [],
    now,
  });

  assert.ok(meta.underfilled.medium !== undefined);
  assert.ok(meta.extraHackerNews > 0);
  assert.ok(meta.underfilled.overall !== undefined && meta.underfilled.overall > 0);
  assert.equal(clusters.length, BRIEFING_TARGET_STORY_COUNT - meta.underfilled.overall);

  const hnCount = clusters.filter((c) =>
    hn.some((h) => h.id === c.representativeArticleId),
  ).length;
  assert.equal(hnCount, BRIEFING_MAX_HN_AFTER_FALLBACK);
});
