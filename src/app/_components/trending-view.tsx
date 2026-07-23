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

type ArchiveDate = { snapshotDate: Date; itemCount: number };

const WEEKDAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Archive navigation: the last 7 snapshots inline, plus a month-by-month
 * calendar for everything older. A flat pill list stopped scaling once the
 * archive ran past a couple of weeks.
 */
export function TrendingArchive({
  dates,
  activeDate,
}: {
  dates: ArchiveDate[];
  activeDate?: string;
}) {
  const recent = dates.slice(0, 7);
  const months = groupByMonth(dates);
  const activeMonthKey = activeDate?.slice(0, 7);
  // Open the month holding the snapshot being viewed, else the newest one.
  const defaultOpenKey =
    activeMonthKey && months.some((m) => m.key === activeMonthKey)
      ? activeMonthKey
      : months[0]?.key;
  const activeInRecent = recent.some((d) => isoOf(d.snapshotDate) === activeDate);

  if (dates.length === 0) return null;

  return (
    <nav className="flex flex-col gap-3" aria-label="Snapshot archive">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Recent
        </h3>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {dates.length} {dates.length === 1 ? "snapshot" : "snapshots"}
        </span>
      </div>

      <ul className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-webkit-overflow-scrolling:touch]">
        {recent.map((d) => {
          const iso = isoOf(d.snapshotDate);
          return (
            <li key={iso} className="shrink-0">
              <Link
                href={`/trending/${iso}`}
                aria-current={activeDate === iso ? "page" : undefined}
                className={`flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-lg border px-2.5 py-2 transition-colors ${
                  activeDate === iso
                    ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-700"
                }`}
              >
                <span className="text-[0.625rem] font-medium uppercase tracking-wide opacity-70">
                  {formatWeekday(d.snapshotDate)}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatDayMonth(d.snapshotDate)}
                </span>
                <span className="text-[0.625rem] tabular-nums opacity-60">
                  {d.itemCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {months.length > 0 && (
        <details
          className="group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          open={!activeInRecent}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            <span>Browse all dates</span>
            <span
              className="text-sm transition-transform group-open:rotate-180"
              aria-hidden
            >
              ▾
            </span>
          </summary>

          <div className="flex flex-col gap-1 border-t border-neutral-200 p-2 dark:border-neutral-800">
            {months.map((month) => (
              <details
                key={month.key}
                open={month.key === defaultOpenKey}
                className="rounded-lg px-1.5 py-1"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-neutral-800 outline-offset-2 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-neutral-100 dark:hover:bg-neutral-800">
                  <span>{month.label}</span>
                  <span className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
                    {month.days.size}
                  </span>
                </summary>
                <MonthCalendar month={month} activeDate={activeDate} />
              </details>
            ))}
          </div>
        </details>
      )}
    </nav>
  );
}

function MonthCalendar({
  month,
  activeDate,
}: {
  month: ArchiveMonth;
  activeDate?: string;
}) {
  const daysInMonth = new Date(
    Date.UTC(month.year, month.month + 1, 0),
  ).getUTCDate();
  // Shift Sunday (0) to the end so the grid starts on Monday.
  const leadingBlanks =
    (new Date(Date.UTC(month.year, month.month, 1)).getUTCDay() + 6) % 7;

  return (
    <div className="px-2 pb-2 pt-1">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((label, i) => (
          <span
            key={i}
            aria-hidden
            className="pb-0.5 text-center text-[0.625rem] font-medium uppercase text-neutral-400 dark:text-neutral-600"
          >
            {label}
          </span>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const entry = month.days.get(day);
          const iso = `${month.key}-${String(day).padStart(2, "0")}`;

          if (!entry) {
            return (
              <span
                key={iso}
                className="flex h-8 items-center justify-center rounded-md text-xs tabular-nums text-neutral-300 dark:text-neutral-700"
              >
                {day}
              </span>
            );
          }

          return (
            <Link
              key={iso}
              href={`/trending/${iso}`}
              title={`${iso} — ${entry} ${entry === 1 ? "item" : "items"}`}
              aria-current={activeDate === iso ? "page" : undefined}
              aria-label={`${iso}, ${entry} items`}
              className={`flex h-8 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors ${
                activeDate === iso
                  ? "bg-violet-600 text-white"
                  : "bg-neutral-100 text-neutral-800 hover:bg-violet-100 hover:text-violet-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-violet-500/20 dark:hover:text-violet-300"
              }`}
            >
              {day}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type ArchiveMonth = {
  /** `YYYY-MM` */
  key: string;
  label: string;
  year: number;
  /** 0-indexed, as in `Date`. */
  month: number;
  /** Day of month → item count. */
  days: Map<number, number>;
};

function groupByMonth(dates: ArchiveDate[]): ArchiveMonth[] {
  const months = new Map<string, ArchiveMonth>();

  for (const d of dates) {
    const year = d.snapshotDate.getUTCFullYear();
    const month = d.snapshotDate.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    let bucket = months.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: formatMonth(d.snapshotDate),
        year,
        month,
        days: new Map(),
      };
      months.set(key, bucket);
    }
    bucket.days.set(d.snapshotDate.getUTCDate(), d.itemCount);
  }

  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function isoOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatWeekday(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

function formatDayMonth(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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
