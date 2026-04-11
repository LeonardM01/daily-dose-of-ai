import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const briefingRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(60).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 30;
      return ctx.db.dailyBriefing.findMany({
        orderBy: { briefingDate: "desc" },
        take: limit,
        select: {
          id: true,
          briefingDate: true,
          title: true,
          status: true,
          durationSeconds: true,
          audioUrl: true,
          createdAt: true,
        },
      });
    }),

  latest: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.dailyBriefing.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { briefingDate: "desc" },
      select: {
        id: true,
        briefingDate: true,
        title: true,
        status: true,
        durationSeconds: true,
        audioUrl: true,
        createdAt: true,
      },
    });
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.dailyBriefing.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          briefingDate: true,
          title: true,
          status: true,
          durationSeconds: true,
          audioUrl: true,
          script: true,
          transcript: true,
          sources: {
            include: {
              article: {
                select: {
                  id: true,
                  title: true,
                  url: true,
                  sourceName: true,
                },
              },
            },
          },
        },
      });
    }),
});
