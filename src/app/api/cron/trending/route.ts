import { NextResponse } from "next/server";

import { env } from "~/env";
import { runTrendingSnapshot } from "~/server/services/trending/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
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

  const result = await runTrendingSnapshot();

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
