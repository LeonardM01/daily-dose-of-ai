"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { TrendingSource } from "../../../generated/prisma";
import {
  TrendingDateStrip,
  TrendingSnapshotView,
  TrendingSourceTabs,
  type TrendingSnapshotShape,
  type TrendingSourceTab,
} from "~/app/_components/trending-view";

function emptyCounts(): Record<TrendingSource, number> {
  return {
    HACKER_NEWS: 0,
    REDDIT: 0,
    PRODUCT_HUNT: 0,
    GITHUB: 0,
  };
}

export function TrendingSnapshotWithTabs({
  snapshot,
  archiveDates,
  activeDateIso,
  pageIntro,
}: {
  snapshot: TrendingSnapshotShape;
  archiveDates: Array<{ snapshotDate: Date; itemCount: number }>;
  activeDateIso: string;
  pageIntro?: ReactNode;
}) {
  const [activeSource, setActiveSource] = useState<TrendingSourceTab>("ALL");

  const counts = useMemo(() => {
    const c = emptyCounts();
    for (const item of snapshot.items) {
      c[item.source] += 1;
    }
    return c;
  }, [snapshot.items]);

  return (
    <div className="flex flex-col gap-6">
      {pageIntro}
      {archiveDates.length > 0 && (
        <TrendingDateStrip dates={archiveDates} activeDate={activeDateIso} />
      )}
      <TrendingSourceTabs
        counts={counts}
        active={activeSource}
        onChange={setActiveSource}
      />
      <TrendingSnapshotView snapshot={snapshot} activeSource={activeSource} />
    </div>
  );
}
