import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  user?: string;
}

const FALLBACK = "dev-fallback-secret-DO-NOT-use-in-prod-rotate-now-please-32+chars";
const raw = process.env.SESSION_SECRET;
const password = raw && raw.length >= 32 ? raw : FALLBACK;
if (!raw) {
  console.warn("[auth] SESSION_SECRET not set — using insecure dev fallback. Set a 32+ char secret in env.");
} else if (raw.length < 32) {
  console.warn(`[auth] SESSION_SECRET is too short (${raw.length} chars, need 32+). Using insecure dev fallback. Fix the env var.`);
}

const sessionOptions: SessionOptions = {
  cookieName: "blinkit-fleet-session",
  password,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

export async function session() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export function checkCredentials(username: string, password: string): boolean {
  const u = process.env.DASHBOARD_USERNAME;
  const p = process.env.DASHBOARD_PASSWORD;
  if (!u || !p) return false;
  return username === u && password === p;
}
