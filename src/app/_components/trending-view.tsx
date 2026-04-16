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

export function TrendingSnapshotView({
  snapshot,
}: {
  snapshot: SnapshotShape;
}) {
  const grouped = groupBySource(snapshot.items);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Snapshot
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          {formatLongDate(snapshot.snapshotDate)}
        </h2>
        {snapshot.status === "PARTIAL" && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Some sources failed to load. Showing everything we could grab.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-10">
        {SOURCE_ORDER.map((source) => {
          const items = grouped.get(source) ?? [];
          const meta = SOURCE_META[source];
          return (
            <section key={source} className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
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
                <ul className="flex flex-col gap-3">
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
    <li className="group rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 min-w-6 text-sm font-semibold tabular-nums ${meta.accentTextClassName}`}
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

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            {score !== null && (
              <span className="inline-flex items-center gap-1">
                <span className={meta.accentTextClassName}>
                  {meta.scoreIcon}
                </span>
                {score} {meta.scoreSuffix}
              </span>
            )}
            {comments !== null && (
              <span>💬 {comments} comments</span>
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
