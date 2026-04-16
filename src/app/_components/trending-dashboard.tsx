"use client";

import {
  TrendingDateStrip,
  TrendingSnapshotView,
} from "~/app/_components/trending-view";
import { api } from "~/trpc/react";

export function TrendingDashboard() {
  const { data: latest, isLoading: loadingLatest } =
    api.trending.latest.useQuery();
  const { data: dates, isLoading: loadingDates } =
    api.trending.listDates.useQuery({ limit: 14 });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Trending</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          A daily snapshot of what tech is reading on Hacker News, Reddit,
          Product Hunt, and GitHub. Captured at 23:00 UTC, archived by date.
        </p>
      </header>

      {loadingLatest && <p className="text-neutral-500">Loading…</p>}
      {!loadingLatest && !latest && (
        <p className="text-neutral-600 dark:text-neutral-400">
          No snapshot yet. The first one lands after tonight&apos;s capture.
        </p>
      )}

      {latest && <TrendingSnapshotView snapshot={latest} />}

      {!loadingDates && dates && dates.length > 0 && (
        <TrendingDateStrip
          dates={dates.map((d) => ({
            snapshotDate: d.snapshotDate,
            itemCount: d.itemCount,
          }))}
          activeDate={
            latest
              ? latest.snapshotDate.toISOString().slice(0, 10)
              : undefined
          }
        />
      )}
    </div>
  );
}
