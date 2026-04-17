import { NextResponse } from "next/server";

import { env } from "~/env";
import { runDailyBriefingPipeline } from "~/server/services/jobs/daily-briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRegenerate = url.searchParams.get("force") === "1";

  const result = await runDailyBriefingPipeline(
    forceRegenerate ? { forceRegenerate: true } : undefined,
  );

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
