import { briefingRouter } from "~/server/api/routers/briefing";
import { trendingRouter } from "~/server/api/routers/trending";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  briefing: briefingRouter,
  trending: trendingRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
