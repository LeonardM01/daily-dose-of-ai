import { titlesLikelySameStory } from "./dedupe-rank";
import {
  type Candidate,
  type ScoredCluster,
  rankTrendingCandidatesToClusters,
  selectTopEditorialClusters,
} from "./score-rank";

export const BRIEFING_LINEUP_QUOTAS = {
  github: 3,
  hackerNews: 4,
  medium: 3,
  devto: 2,
  techcrunch: 2,
} as const;

export const BRIEFING_TARGET_STORY_COUNT = 14;

export const BRIEFING_MAX_HN_AFTER_FALLBACK = 6;

const CLUSTER_POOL = 48;

function selectRankedTrendingClusters(
  candidates: Candidate[],
  now: Date,
  _topN: number,
): ScoredCluster[] {
  if (candidates.length === 0) return [];
  return rankTrendingCandidatesToClusters(candidates, { now });
}

function selectRankedEditorialClusters(
  candidates: Candidate[],
  now: Date,
  topN: number,
): ScoredCluster[] {
  if (candidates.length === 0) return [];
  return selectTopEditorialClusters(candidates, { now, topN });
}

function conflictsAnyTitle(title: string, against: string[]): boolean {
  return against.some((t) => titlesLikelySameStory(t, title));
}

export function pickClustersWithDedupe(
  ranked: ScoredCluster[],
  quota: number,
  excludedTitles: string[],
  options: { intraBucketFuzzy?: boolean } = {},
): { picked: ScoredCluster[]; titles: string[] } {
  const intraBucketFuzzy = options.intraBucketFuzzy ?? true;
  const picked: ScoredCluster[] = [];
  const titles = [...excludedTitles];
  for (const c of ranked) {
    if (picked.length >= quota) break;
    const blocklist = intraBucketFuzzy ? titles : excludedTitles;
    if (conflictsAnyTitle(c.title, blocklist)) continue;
    if (picked.some((p) => p.primaryUrl === c.primaryUrl)) continue;
    picked.push(c);
    titles.push(c.title);
  }
  return { picked, titles };
}

function pickNextCluster(
  ranked: ScoredCluster[],
  pickedIds: Set<string>,
  titles: string[],
): { cluster: ScoredCluster | null; titles: string[] } {
  for (const c of ranked) {
    if (pickedIds.has(c.representativeArticleId)) continue;
    if (conflictsAnyTitle(c.title, titles)) continue;
    return {
      cluster: c,
      titles: [...titles, c.title],
    };
  }
  return { cluster: null, titles };
}

function fillEditorialBucket(params: {
  primary: ScoredCluster[];
  quota: number;
  fallbackPools: ScoredCluster[][];
  titles: string[];
  onFallbackCount?: (n: number) => void;
  intraBucketFuzzy?: boolean;
}): { picked: ScoredCluster[]; titles: string[] } {
  const { primary, quota, fallbackPools, onFallbackCount } = params;
  const intraBucketFuzzy = params.intraBucketFuzzy ?? false;
  const { picked, titles: pickedTitles } = pickClustersWithDedupe(primary, quota, params.titles, {
    intraBucketFuzzy,
  });
  let titles = pickedTitles;
  let need = quota - picked.length;
  if (need > 0) {
    for (const pool of fallbackPools) {
      if (need <= 0) break;
      const extra = pickClustersWithDedupe(pool, need, titles, {
        intraBucketFuzzy,
      });
      if (extra.picked.length > 0) {
        onFallbackCount?.(extra.picked.length);
      }
      picked.push(...extra.picked);
      titles = extra.titles;
      need = quota - picked.length;
    }
  }
  return { picked, titles };
}

export type BriefingLineupMeta = {
  underfilled: Partial<
    Record<
      | "github"
      | "hackerNews"
      | "medium"
      | "devto"
      | "techcrunch"
      | "overall",
      number
    >
  >;
  editorialFallbackArticles: number;
  extraHackerNews: number;
};

export type BriefingLineupResult = {
  clusters: ScoredCluster[];
  meta: BriefingLineupMeta;
};

export function assembleBriefingLineup(params: {
  github: Candidate[];
  hackerNews: Candidate[];
  medium: Candidate[];
  devto: Candidate[];
  techcrunch: Candidate[];
  now?: Date;
}): BriefingLineupResult {
  const now = params.now ?? new Date();
  const q = BRIEFING_LINEUP_QUOTAS;

  const meta: BriefingLineupMeta = {
    underfilled: {},
    editorialFallbackArticles: 0,
    extraHackerNews: 0,
  };

  const recordEditorialFallback = (n: number) => {
    meta.editorialFallbackArticles += n;
  };

  const ghRanked = selectRankedTrendingClusters(
    params.github,
    now,
    Math.max(CLUSTER_POOL, q.github * 8),
  );
  const hnRanked = selectRankedTrendingClusters(
    params.hackerNews,
    now,
    Math.max(CLUSTER_POOL, BRIEFING_MAX_HN_AFTER_FALLBACK * 8),
  );
  const mediumRanked = selectRankedEditorialClusters(
    params.medium,
    now,
    CLUSTER_POOL,
  );
  const devtoRanked = selectRankedEditorialClusters(
    params.devto,
    now,
    CLUSTER_POOL,
  );
  const tcRanked = selectRankedEditorialClusters(
    params.techcrunch,
    now,
    CLUSTER_POOL,
  );

  const { picked: ghPicked, titles: afterGh } = pickClustersWithDedupe(
    ghRanked,
    q.github,
    [],
    { intraBucketFuzzy: false },
  );
  if (ghPicked.length < q.github) {
    meta.underfilled.github = q.github - ghPicked.length;
  }

  const { picked: hnPicked, titles: afterHn } = pickClustersWithDedupe(
    hnRanked,
    q.hackerNews,
    afterGh,
    { intraBucketFuzzy: false },
  );
  if (hnPicked.length < q.hackerNews) {
    meta.underfilled.hackerNews = q.hackerNews - hnPicked.length;
  }

  let titles = afterHn;

  const mediumFill = fillEditorialBucket({
    primary: mediumRanked,
    quota: q.medium,
    fallbackPools: [devtoRanked, tcRanked],
    titles,
    onFallbackCount: recordEditorialFallback,
  });
  if (mediumFill.picked.length < q.medium) {
    meta.underfilled.medium = q.medium - mediumFill.picked.length;
  }
  titles = mediumFill.titles;

  const devFill = fillEditorialBucket({
    primary: devtoRanked,
    quota: q.devto,
    fallbackPools: [mediumRanked, tcRanked],
    titles,
    onFallbackCount: recordEditorialFallback,
  });
  if (devFill.picked.length < q.devto) {
    meta.underfilled.devto = q.devto - devFill.picked.length;
  }
  titles = devFill.titles;

  const tcFill = fillEditorialBucket({
    primary: tcRanked,
    quota: q.techcrunch,
    fallbackPools: [mediumRanked, devtoRanked],
    titles,
    onFallbackCount: recordEditorialFallback,
  });
  if (tcFill.picked.length < q.techcrunch) {
    meta.underfilled.techcrunch = q.techcrunch - tcFill.picked.length;
  }
  titles = tcFill.titles;

  const hnIds = new Set(hnPicked.map((c) => c.representativeArticleId));
  const hnList = [...hnPicked];

  const crossSourceTitlesForExtraHn = [
    ...ghPicked.map((c) => c.title),
    ...mediumFill.picked.map((c) => c.title),
    ...devFill.picked.map((c) => c.title),
    ...tcFill.picked.map((c) => c.title),
  ];

  let assembled: ScoredCluster[] = [
    ...ghPicked,
    ...hnList,
    ...mediumFill.picked,
    ...devFill.picked,
    ...tcFill.picked,
  ];

  let shortfall = BRIEFING_TARGET_STORY_COUNT - assembled.length;
  while (
    shortfall > 0 &&
    hnList.length < BRIEFING_MAX_HN_AFTER_FALLBACK
  ) {
    const { cluster } = pickNextCluster(
      hnRanked,
      hnIds,
      crossSourceTitlesForExtraHn,
    );
    if (!cluster) break;
    hnIds.add(cluster.representativeArticleId);
    hnList.push(cluster);
    meta.extraHackerNews += 1;
    shortfall -= 1;
  }

  assembled = [
    ...ghPicked,
    ...hnList,
    ...mediumFill.picked,
    ...devFill.picked,
    ...tcFill.picked,
  ];

  if (assembled.length < BRIEFING_TARGET_STORY_COUNT) {
    meta.underfilled.overall = BRIEFING_TARGET_STORY_COUNT - assembled.length;
  }

  return { clusters: assembled, meta };
}
