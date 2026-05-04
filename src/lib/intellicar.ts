import { unstable_cache } from "next/cache";

const BASE = process.env.INTELLICAR_BASE_URL ?? "https://apiplatform.intellicar.in/api/standard";
const USER = process.env.INTELLICAR_USERNAME!;
const PASS = process.env.INTELLICAR_PASSWORD!;

if (!USER || !PASS) {
  // Allow build to succeed without creds; fail loudly at first call.
  console.warn("[intellicar] credentials missing");
}

// Token cache stays in-memory: cheap, only one value per process, and refreshing
// from any instance via Intellicar's gettoken endpoint is a 200ms operation.
declare global {
  // eslint-disable-next-line no-var
  var __intellicarToken: { token: string; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __intellicarTokenInflight: Promise<string> | undefined;
}

const TOKEN_REFRESH_BEFORE_MS = 12 * 60 * 60 * 1000;

async function fetchToken(): Promise<string> {
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
    // Token TTL ~15 days per docs; assume 14 days to be safe
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
    // Token may be expired — invalidate and retry once
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

export interface LastGps {
  commtime: number;
  lat: number;
  lng: number;
  alti?: number;
  devbattery?: number;
  vehbattery?: number;
  speed: number;
  heading?: number;
  ignstatus: "on" | "off" | string;
  odometer?: number;
  mobili?: number;
}

export interface DistanceResult {
  distance: number;
  startodo?: number;
  endodo?: number;
  starttime?: number;
  endtime?: number;
  lastignon?: number;
  lastignoff?: number;
  startLoc?: [number, number];
  endLoc?: [number, number];
}

export interface GpsHistoryPoint {
  commtime: number;
  time?: number;
  latitude: number;
  longitude: number;
  speed: number;
  odometer?: number;
  ignstatus: number | string;
  heading?: number;
  carbattery?: number;
  vehbattery?: number;
  altitude?: number;
}

export interface VehicleInfo {
  vehicleno: string;
  createdat?: number;
  type?: string;
  chassisno?: string;
  model?: string;
  immobilize_type?: string;
  assignedgroups?: { groupname: string }[];
}

// ---------- Vercel Data Cache wrappers ----------
// `unstable_cache` is backed by Vercel's Data Cache: shared across every serverless
// instance and across requests. CRITICAL: the inner functions must THROW on error
// (not return null/empty) — otherwise unstable_cache would happily cache the failure
// for the full TTL, blanking out a rider for 60s. Outer wrappers catch and convert
// to null so the UI can render "—".

async function _fetchLastGps(vehicleno: string): Promise<LastGps> {
  return call<LastGps>("getlastgpsstatus", { vehicleno });
}
const cachedLastGps = unstable_cache(
  _fetchLastGps,
  ["intellicar:lastGps:v2"],
  { revalidate: 25, tags: ["intellicar", "live"] }
);

async function _fetchDistance(vehicleno: string, starttime: number, endtime: number): Promise<DistanceResult> {
  return call<DistanceResult>("getdistancetravelled", {
    vehicleno,
    starttime: String(starttime),
    endtime: String(endtime),
  });
}
const cachedDistance = unstable_cache(
  _fetchDistance,
  ["intellicar:distance:v2"],
  { revalidate: 60, tags: ["intellicar", "distance"] }
);

async function _fetchGpsHistory(vehicleno: string, starttime: number, endtime: number): Promise<GpsHistoryPoint[]> {
  const points = await call<GpsHistoryPoint[]>("getgpshistory", {
    vehicleno,
    starttime: String(starttime),
    endtime: String(endtime),
  });
  return points || [];
}
const cachedGpsHistory = unstable_cache(
  _fetchGpsHistory,
  ["intellicar:gpsHistory:v2"],
  { revalidate: 60, tags: ["intellicar", "history"] }
);

async function _fetchVehicleSet(): Promise<string[]> {
  const list = await call<{ vehicleno: string }[]>("listvehicles", {});
  return (list || []).map((v) => v.vehicleno);
}
const cachedVehicleSet = unstable_cache(
  _fetchVehicleSet,
  ["intellicar:vehicleSet:v2"],
  { revalidate: 300, tags: ["intellicar", "admin"] }
);

// ---------- Public API (errors → null, not cached) ----------

export async function getLastGps(vehicleno: string): Promise<LastGps | null> {
  try { return await cachedLastGps(vehicleno); } catch { return null; }
}

export async function getDistance(vehicleno: string, starttime: number, endtime: number): Promise<DistanceResult | null> {
  try { return await cachedDistance(vehicleno, starttime, endtime); } catch { return null; }
}

export async function getGpsHistory(vehicleno: string, starttime: number, endtime: number): Promise<GpsHistoryPoint[]> {
  try { return await cachedGpsHistory(vehicleno, starttime, endtime); } catch { return []; }
}

export async function getVehicleInfo(vehicleno: string): Promise<VehicleInfo | null> {
  try {
    return await call<VehicleInfo>("getvehicleinfo", { vehicleno });
  } catch {
    return null;
  }
}

export async function getProvisionedVehicleSet(): Promise<Set<string>> {
  try { return new Set(await cachedVehicleSet()); } catch { return new Set(); }
}

// ---------- Helpers ----------

export type LiveStatus = "on-trip" | "idle" | "parked" | "offline" | "unknown";

export function classifyStatus(g: LastGps | null): LiveStatus {
  if (!g) return "unknown";
  const ageMs = Date.now() - g.commtime;
  if (ageMs > 10 * 60 * 1000) return "offline";
  const ign = String(g.ignstatus).toLowerCase();
  if (ign === "on" || ign === "1") {
    return g.speed > 5 ? "on-trip" : "idle";
  }
  return "parked";
}
