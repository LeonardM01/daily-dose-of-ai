"use client";

import Link from "next/link";

import { getSafeHttpUrl } from "~/lib/safe-external-url";
import type { TrendingSource } from "../../../generated/prisma";

import {
  SOURCE_META,
  SOURCE_ORDER,
  formatCount,
} from "./trending-source-meta";

type TrendingItemShape = {
  id: string;
  source: TrendingSource;
  rank: number;
  title: string;
  url: string;
  description: string | null;
  score: number | null;
  commentCount: number | null;
  author: string | null;
  subsource: string | null;
  thumbnailUrl: string | null;
};

type SnapshotShape = {
  id: string;
  snapshotDate: Date;
  status: string;
  items: TrendingItemShape[];
};

export type TrendingSnapshotShape = SnapshotShape;

export type TrendingSourceTab = "ALL" | TrendingSource;

export function TrendingSourceTabs({
  counts,
  active,
  onChange,
}: {
  counts: Record<TrendingSource, number>;
  active: TrendingSourceTab;
  onChange: (tab: TrendingSourceTab) => void;
}) {
  const totalAll = SOURCE_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  const tabButton = (
    tab: TrendingSourceTab,
    label: string,
    count: number,
    activeClasses: string,
    inactiveClasses: string,
  ) => {
    const isOn = active === tab;
    return (
      <button
        type="button"
        key={tab}
        onClick={() => onChange(tab)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
          isOn ? activeClasses : inactiveClasses
        }`}
        aria-pressed={isOn}
      >
        <span>{label}</span>
        <span
          className={
            isOn
              ? "tabular-nums opacity-90"
              : "tabular-nums text-neutral-400 dark:text-neutral-500"
          }
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="sticky top-14 z-30 -mx-4 border-b border-neutral-200/80 bg-neutral-50/95 px-4 py-2 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/95">
      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-webkit-overflow-scrolling:touch]"
        role="tablist"
        aria-label="Trending sources"
      >
        {tabButton(
          "ALL",
          "All",
          totalAll,
          "border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-600",
          "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700",
        )}
        {SOURCE_ORDER.map((source) => {
          const meta = SOURCE_META[source];
          const n = counts[source] ?? 0;
          return tabButton(
            source,
            meta.shortLabel,
            n,
            `${meta.badgeClassName} border-transparent shadow-sm`,
            "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700",
          );
        })}
      </div>
    </div>
  );
}

export function TrendingSnapshotView({
  snapshot,
  activeSource = "ALL",
}: {
  snapshot: SnapshotShape;
  activeSource?: TrendingSourceTab;
}) {
  const grouped = groupBySource(snapshot.items);
  const sources: TrendingSource[] =
    activeSource !== "ALL" ? [activeSource] : [...SOURCE_ORDER];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Snapshot
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {formatLongDate(snapshot.snapshotDate)}
        </h2>
      </header>

      <div className="flex flex-col gap-8">
        {sources.map((source) => {
          const items = grouped.get(source) ?? [];
          const meta = SOURCE_META[source];
          return (
            <section key={source} className="flex flex-col gap-3">
              <div className="flex items-end justify-between gap-3 border-b border-neutral-200 pb-2.5 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${meta.badgeClassName}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm text-neutral-500">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Slow news day. No items captured for this source.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <TrendingItemRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TrendingItemRow({ item }: { item: TrendingItemShape }) {
  const meta = SOURCE_META[item.source];
  const safeUrl = getSafeHttpUrl(item.url);
  const safeThumb = item.thumbnailUrl
    ? getSafeHttpUrl(item.thumbnailUrl)
    : null;
  const score = formatCount(item.score);
  const comments = formatCount(item.commentCount);

  return (
    <li className="group rounded-xl border border-neutral-200 bg-white p-3.5 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ring-1 ring-inset ring-current/25 ${meta.accentTextClassName} bg-white dark:bg-neutral-950`}
          aria-label={`Rank ${item.rank}`}
        >
          {item.rank}
        </span>

        {safeThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeThumb}
            alt=""
            loading="lazy"
            className="h-12 w-12 flex-shrink-0 rounded-md object-cover ring-1 ring-neutral-200 dark:ring-neutral-800"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-snug text-neutral-900 hover:text-violet-700 dark:text-neutral-50 dark:hover:text-violet-400"
            >
              {item.title}
            </a>
          ) : (
            <span className="text-sm font-semibold leading-snug text-neutral-900 dark:text-neutral-50">
              {item.title}
            </span>
          )}

          {item.description && (
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {item.description}
            </p>
          )}

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            {score !== null && (
              <span className="inline-flex items-center gap-1">
                <span className={meta.accentTextClassName}>
                  {meta.scoreIcon}
                </span>
                {score} {meta.scoreSuffix}
              </span>
            )}
            {comments !== null && (
              <span>
                <span aria-hidden>💬</span> {comments} comments
              </span>
            )}
            {item.subsource && (
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                {item.subsource}
              </span>
            )}
            {item.author && <span>by {item.author}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

export function TrendingDateStrip({
  dates,
  activeDate,
}: {
  dates: Array<{ snapshotDate: Date; itemCount: number }>;
  activeDate?: string;
}) {
  if (dates.length === 0) return null;
  return (
    <nav className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        Archive
      </h3>
      <ul className="flex flex-wrap gap-2">
        {dates.map((d) => {
          const iso = d.snapshotDate.toISOString().slice(0, 10);
          const isActive = activeDate === iso;
          return (
            <li key={iso}>
              <Link
                href={`/trending/${iso}`}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700"
                }`}
              >
                <span>{iso}</span>
                <span className="text-neutral-400 dark:text-neutral-500">
                  {d.itemCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function groupBySource(items: TrendingItemShape[]) {
  const map = new Map<TrendingSource, TrendingItemShape[]>();
  for (const item of items) {
    const arr = map.get(item.source) ?? [];
    arr.push(item);
    map.set(item.source, arr);
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => a.rank - b.rank);
    map.set(k, arr);
  }
  return map;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
