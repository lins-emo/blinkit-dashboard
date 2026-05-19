import { NextResponse } from "next/server";
import { getAllRiderRows } from "@/lib/data";

// Cache-warmer endpoint. An external cron pings this every ~45 s so the
// unstable_cache entry behind getAllRiderRows() is always fresh — real users
// then always hit the warm path (~50 ms) instead of a cold miss (2-5 s).
//
// Protected by a shared secret so it can't be hammered by randoms.
//   GET /api/warm?secret=<WARM_SECRET>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const secret = process.env.WARM_SECRET;
  const provided = new URL(req.url).searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const t0 = Date.now();
  const rows = await getAllRiderRows();
  const ms = Date.now() - t0;

  return NextResponse.json({
    ok: true,
    riders: rows.length,
    ms,
    warmedAt: new Date().toISOString(),
  });
}
