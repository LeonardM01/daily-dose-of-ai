import Link from "next/link";
import { notFound } from "next/navigation";

import { TrendingSnapshotWithTabs } from "~/app/_components/trending-snapshot-with-tabs";
import { db } from "~/server/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrendingByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) {
    notFound();
  }
  const snapshotDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(snapshotDate.getTime())) {
    notFound();
  }

  const [snapshot, archive] = await Promise.all([
    db.trendingSnapshot.findUnique({
      where: { snapshotDate },
      select: {
        id: true,
        snapshotDate: true,
        status: true,
        errorMessage: true,
        items: {
          orderBy: [{ source: "asc" }, { rank: "asc" }],
          select: {
            id: true,
            source: true,
            externalId: true,
            rank: true,
            title: true,
            url: true,
            description: true,
            score: true,
            commentCount: true,
            author: true,
            subsource: true,
            thumbnailUrl: true,
          },
        },
      },
    }),
    db.trendingSnapshot.findMany({
      where: { status: { in: ["COMPLETED", "PARTIAL"] } },
      orderBy: { snapshotDate: "desc" },
      take: 14,
      select: {
        snapshotDate: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  if (!snapshot) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <Link
          href="/trending"
          className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          ← Back to trending
        </Link>
        <TrendingSnapshotWithTabs
          snapshot={snapshot}
          archiveDates={archive.map((d) => ({
            snapshotDate: d.snapshotDate,
            itemCount: d._count.items,
          }))}
          activeDateIso={date}
        />
      </div>
    </main>
  );
}
