import { NextResponse } from "next/server";
import { getRiderDoc } from "@/lib/data";
import { getGpsHistory } from "@/lib/intellicar";
import { summarize } from "@/lib/behavior";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const hours = Number(url.searchParams.get("hours") ?? "24");
  const safeHours = Math.min(Math.max(hours, 1), 24 * 7);

  const rider = await getRiderDoc(id);
  if (!rider) return NextResponse.json({ error: "not found" }, { status: 404 });
  const v = rider.vehicleAssigned?.vehicleId?.trim();
  if (!v || /^Testing/i.test(v)) {
    return NextResponse.json({ rider: { id: String(rider._id) }, summary: null, points: [] });
  }
  const now = Date.now();
  const start = now - safeHours * 60 * 60 * 1000;
  const points = await getGpsHistory(v, start, now);
  const summary = summarize(points);
  // Trim points sent to client to keep payload small but useful for map
  const slim = points.map((p) => ({
    t: p.commtime,
    lat: p.latitude,
    lng: p.longitude,
    sp: p.speed,
    ig: p.ignstatus,
  }));
  return NextResponse.json({ summary, points: slim });
}

export const dynamic = "force-dynamic";
