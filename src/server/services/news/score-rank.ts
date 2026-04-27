import {
  clusterArticles,
  type ArticleForRank,
  type StoryCluster,
} from "./dedupe-rank";

export type CandidateSourceKind = "HN" | "PH" | "GH" | "REDDIT" | "RSS";

export type Candidate = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  excerpt: string | null;
  publishedAt: Date | null;
  sourceKind: CandidateSourceKind;
  /** Raw engagement count (HN points, PH votes, GH stars-today, Reddit ups). RSS uses a baseline. */
  engagement: number;
};

export type ScoredCluster = StoryCluster & {
  score: number;
};

const SOURCE_TIER_WEIGHT: Record<CandidateSourceKind, number> = {
  HN: 1.2,
  PH: 1.1,
  GH: 1.0,
  REDDIT: 0.9,
  RSS: 1.0,
};

const RSS_BASELINE_ENGAGEMENT = 80;
const RECENCY_HALF_LIFE_HOURS = 12;

export function scoreCandidate(
  candidate: Candidate,
  now: Date = new Date(),
): number {
  const engagement =
    candidate.sourceKind === "RSS"
      ? RSS_BASELINE_ENGAGEMENT
      : Math.max(0, candidate.engagement);
  const tier = SOURCE_TIER_WEIGHT[candidate.sourceKind];
  const ageHours = candidate.publishedAt
    ? Math.max(
        0,
        (now.getTime() - candidate.publishedAt.getTime()) / 3_600_000,
      )
    : 0;
  const recency = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
  return Math.log1p(engagement) * tier * recency;
}

export function selectTopClusters(
  candidates: Candidate[],
  options: { now?: Date; topN?: number } = {},
): ScoredCluster[] {
  const now = options.now ?? new Date();
  const topN = options.topN ?? 12;

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, now) }))
    .sort((a, b) => b.score - a.score);

  const articlesForCluster: ArticleForRank[] = scored.map(({ candidate }) => ({
    id: candidate.id,
    title: candidate.title,
    url: candidate.url,
    sourceName: candidate.sourceName,
    excerpt: candidate.excerpt,
  }));
  const clusters = clusterArticles(articlesForCluster);

  const scoreById = new Map(
    scored.map(({ candidate, score }) => [candidate.id, score]),
  );

  return clusters
    .map((cluster) => ({
      ...cluster,
      score: cluster.articleIds.reduce(
        (sum, id) => sum + (scoreById.get(id) ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
