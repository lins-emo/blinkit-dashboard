import { NextResponse } from "next/server";
import { checkCredentials, session } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = body?.username?.toString() ?? "";
  const password = body?.password?.toString() ?? "";
  if (!checkCredentials(username, password)) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }
  const s = await session();
  s.user = username;
  await s.save();
  return NextResponse.json({ ok: true });
}
