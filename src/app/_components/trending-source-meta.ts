import type { TrendingSource } from "../../../generated/prisma";

export type SourceMeta = {
  label: string;
  shortLabel: string;
  scoreIcon: string;
  scoreSuffix: string;
  badgeClassName: string;
  accentTextClassName: string;
};

export const SOURCE_ORDER: TrendingSource[] = [
  "HACKER_NEWS",
  "REDDIT",
  "PRODUCT_HUNT",
  "GITHUB",
];

export const SOURCE_META: Record<TrendingSource, SourceMeta> = {
  HACKER_NEWS: {
    label: "Hacker News",
    shortLabel: "HN",
    scoreIcon: "▲",
    scoreSuffix: "points",
    badgeClassName:
      "bg-[#FF6600] text-white ring-1 ring-[#FF6600]/40",
    accentTextClassName: "text-[#FF6600]",
  },
  REDDIT: {
    label: "Reddit",
    shortLabel: "Reddit",
    scoreIcon: "▲",
    scoreSuffix: "upvotes",
    badgeClassName:
      "bg-[#FF4500] text-white ring-1 ring-[#FF4500]/40",
    accentTextClassName: "text-[#FF4500]",
  },
  PRODUCT_HUNT: {
    label: "Product Hunt",
    shortLabel: "PH",
    scoreIcon: "▲",
    scoreSuffix: "upvotes",
    badgeClassName:
      "bg-[#DA552F] text-white ring-1 ring-[#DA552F]/40",
    accentTextClassName: "text-[#DA552F]",
  },
  GITHUB: {
    label: "GitHub Trending",
    shortLabel: "GitHub",
    scoreIcon: "★",
    scoreSuffix: "stars",
    badgeClassName:
      "bg-neutral-900 text-white ring-1 ring-neutral-900/40 dark:bg-neutral-100 dark:text-neutral-900 dark:ring-neutral-100/40",
    accentTextClassName: "text-neutral-900 dark:text-neutral-100",
  },
};

export function formatCount(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
