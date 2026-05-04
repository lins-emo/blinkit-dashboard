import { NextResponse } from "next/server";
import { getAllRiderRows } from "@/lib/data";

export async function GET() {
  const rows = await getAllRiderRows();
  return NextResponse.json({ rows });
}

export const dynamic = "force-dynamic";
