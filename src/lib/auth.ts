import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  user?: string;
}

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  console.warn("[auth] SESSION_SECRET should be at least 32 characters");
}

const sessionOptions: SessionOptions = {
  cookieName: "blinkit-fleet-session",
  password: password || "fallback-dev-secret-please-rotate-32chars!!",
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
