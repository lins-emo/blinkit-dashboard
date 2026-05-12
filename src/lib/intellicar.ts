import { unstable_cache } from "next/cache";

// Intellicar is kept as a *fallback* source for distance + live GPS for vehicles
// Sensiot doesn't cover. Sensiot is the primary source.

const BASE = process.env.INTELLICAR_BASE_URL ?? "https://apiplatform.intellicar.in/api/standard";
const USER = process.env.INTELLICAR_USERNAME;
const PASS = process.env.INTELLICAR_PASSWORD;

declare global {
  // eslint-disable-next-line no-var
  var __intellicarToken: { token: string; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __intellicarTokenInflight: Promise<string> | undefined;
}

const TOKEN_REFRESH_BEFORE_MS = 12 * 60 * 60 * 1000;

async function fetchToken(): Promise<string> {
  if (!USER || !PASS) throw new Error("Intellicar credentials missing");
  const r = await fetch(`${BASE}/gettoken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const j = await r.json();
  if (j?.status !== "SUCCESS" || !j?.data?.token) {
    throw new Error("intellicar auth failed: " + JSON.stringify(j));
  }
  return j.data.token as string;
}

export async function getToken(): Promise<string> {
  const now = Date.now();
  const cached = global.__intellicarToken;
  if (cached && cached.expiresAt - TOKEN_REFRESH_BEFORE_MS > now) return cached.token;
  if (global.__intellicarTokenInflight) return global.__intellicarTokenInflight;
  global.__intellicarTokenInflight = fetchToken().then((token) => {
    global.__intellicarToken = { token, expiresAt: now + 14 * 24 * 60 * 60 * 1000 };
    global.__intellicarTokenInflight = undefined;
    return token;
  }).catch((e) => {
    global.__intellicarTokenInflight = undefined;
    throw e;
  });
  return global.__intellicarTokenInflight;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const r = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...body }),
    cache: "no-store",
  });
  const j = await r.json();
  if (j?.status !== "SUCCESS") {
    if (j?.msg && /token/i.test(j.msg)) {
      global.__intellicarToken = undefined;
      const fresh = await getToken();
      const r2 = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: fresh, ...body }),
        cache: "no-store",
      });
      const j2 = await r2.json();
      if (j2?.status !== "SUCCESS") throw new Error(`intellicar ${path} failed: ${j2?.msg ?? "unknown"}`);
      return j2.data as T;
    }
    throw new Error(`intellicar ${path} failed: ${j?.msg ?? "unknown"}`);
  }
  return j.data as T;
}

export interface IntellicarDistance {
  distance: number;
  startodo?: number;
  endodo?: number;
  startLoc?: [number, number];
  endLoc?: [number, number];
  lastignon?: number;
  lastignoff?: number;
}

async function _fetchProvisionedVehicles(): Promise<string[]> {
  const list = await call<{ vehicleno: string }[]>("listvehicles", {});
  return (list || []).map((v) => v.vehicleno);
}
const cachedProvisioned = unstable_cache(
  _fetchProvisionedVehicles,
  ["intellicar:listVehicles:v2"],
  { revalidate: 300, tags: ["intellicar"] }
);

async function _fetchDistance(vehicleno: string, starttime: number, endtime: number): Promise<IntellicarDistance> {
  return call<IntellicarDistance>("getdistancetravelled", {
    vehicleno, starttime: String(starttime), endtime: String(endtime),
  });
}
const cachedDistance = unstable_cache(
  _fetchDistance,
  ["intellicar:distance:v3"],
  { revalidate: 60, tags: ["intellicar"] }
);

export async function getIntellicarVehicleSet(): Promise<Set<string>> {
  if (!USER || !PASS) return new Set();
  try { return new Set(await cachedProvisioned()); } catch { return new Set(); }
}

export async function getIntellicarDistance(
  vehicleno: string,
  starttime: number,
  endtime: number
): Promise<IntellicarDistance | null> {
  if (!USER || !PASS) return null;
  try { return await cachedDistance(vehicleno, starttime, endtime); } catch { return null; }
}
