import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(raw: string): Date | null {
  if (!DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const SNAPSHOT_SELECT = {
  id: true,
  snapshotDate: true,
  status: true,
  errorMessage: true,
  updatedAt: true,
  items: {
    orderBy: [{ source: "asc" as const }, { rank: "asc" as const }],
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
};

export const trendingRouter = createTRPCRouter({
  latest: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.trendingSnapshot.findFirst({
      where: { status: { in: ["COMPLETED", "PARTIAL"] } },
      orderBy: { snapshotDate: "desc" },
      select: SNAPSHOT_SELECT,
    });
  }),

  byDate: publicProcedure
    .input(z.object({ date: z.string().regex(DATE_RE) }))
    .query(async ({ ctx, input }) => {
      const date = parseDateParam(input.date);
      if (!date) return null;
      return ctx.db.trendingSnapshot.findUnique({
        where: { snapshotDate: date },
        select: SNAPSHOT_SELECT,
      });
    }),

  listDates: publicProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(60).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 14;
      const rows = await ctx.db.trendingSnapshot.findMany({
        where: { status: { in: ["COMPLETED", "PARTIAL"] } },
        orderBy: { snapshotDate: "desc" },
        take: limit,
        select: {
          id: true,
          snapshotDate: true,
          status: true,
          _count: { select: { items: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        snapshotDate: r.snapshotDate,
        status: r.status,
        itemCount: r._count.items,
      }));
    }),
});
