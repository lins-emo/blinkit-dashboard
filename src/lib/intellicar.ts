const BASE = process.env.INTELLICAR_BASE_URL ?? "https://apiplatform.intellicar.in/api/standard";
const USER = process.env.INTELLICAR_USERNAME!;
const PASS = process.env.INTELLICAR_PASSWORD!;

if (!USER || !PASS) {
  // Allow build to succeed without creds; fail loudly at first call.
  console.warn("[intellicar] credentials missing");
}

declare global {
  // eslint-disable-next-line no-var
  var __intellicarToken: { token: string; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __intellicarTokenInflight: Promise<string> | undefined;
  // eslint-disable-next-line no-var
  var __gpsHistoryCache: Map<string, { fetchedAt: number; points: GpsHistoryPoint[] }> | undefined;
  // eslint-disable-next-line no-var
  var __liveGpsCache: Map<string, { fetchedAt: number; data: LastGps | null }> | undefined;
  // eslint-disable-next-line no-var
  var __vehicleSet: { fetchedAt: number; set: Set<string> } | undefined;
  // eslint-disable-next-line no-var
  var __distanceCache: Map<string, { fetchedAt: number; data: DistanceResult | null }> | undefined;
}

const HISTORY_TTL_MS = 60_000;
const LIVE_TTL_MS = 25_000;
const DISTANCE_TTL_MS = 60_000;          // re-fetch distances at most once per minute
const STALE_FALLBACK_MS = 10 * 60_000;   // keep showing stale value for 10 min if fresh fetch fails
const TOKEN_REFRESH_BEFORE_MS = 12 * 60 * 60 * 1000;

if (!global.__gpsHistoryCache) global.__gpsHistoryCache = new Map();
if (!global.__liveGpsCache) global.__liveGpsCache = new Map();
if (!global.__distanceCache) global.__distanceCache = new Map();

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

export async function getLastGps(vehicleno: string): Promise<LastGps | null> {
  const cache = global.__liveGpsCache!;
  const c = cache.get(vehicleno);
  const now = Date.now();
  if (c && now - c.fetchedAt < LIVE_TTL_MS) return c.data;
  try {
    const data = await call<LastGps>("getlastgpsstatus", { vehicleno });
    cache.set(vehicleno, { fetchedAt: now, data });
    return data;
  } catch {
    // Stale-on-error: keep showing previous value if reasonably recent
    if (c && now - c.fetchedAt < STALE_FALLBACK_MS && c.data) return c.data;
    cache.set(vehicleno, { fetchedAt: now, data: null });
    return null;
  }
}

export async function getDistance(vehicleno: string, starttime: number, endtime: number): Promise<DistanceResult | null> {
  const cache = global.__distanceCache!;
  const key = `${vehicleno}|${starttime}|${endtime}`;
  const c = cache.get(key);
  const now = Date.now();
  if (c && now - c.fetchedAt < DISTANCE_TTL_MS) return c.data;
  try {
    const data = await call<DistanceResult>("getdistancetravelled", {
      vehicleno,
      starttime: String(starttime),
      endtime: String(endtime),
    });
    cache.set(key, { fetchedAt: now, data });
    return data;
  } catch {
    // Stale-on-error: keep showing previous value if reasonably recent
    if (c && now - c.fetchedAt < STALE_FALLBACK_MS && c.data) return c.data;
    cache.set(key, { fetchedAt: now, data: null });
    return null;
  }
}

export async function getGpsHistory(vehicleno: string, starttime: number, endtime: number): Promise<GpsHistoryPoint[]> {
  const cacheKey = `${vehicleno}|${starttime}|${endtime}`;
  const cache = global.__gpsHistoryCache!;
  const c = cache.get(cacheKey);
  const now = Date.now();
  if (c && now - c.fetchedAt < HISTORY_TTL_MS) return c.points;
  try {
    const points = await call<GpsHistoryPoint[]>("getgpshistory", {
      vehicleno,
      starttime: String(starttime),
      endtime: String(endtime),
    });
    cache.set(cacheKey, { fetchedAt: now, points: points || [] });
    return points || [];
  } catch {
    cache.set(cacheKey, { fetchedAt: now, points: [] });
    return [];
  }
}

export async function getVehicleInfo(vehicleno: string): Promise<VehicleInfo | null> {
  try {
    return await call<VehicleInfo>("getvehicleinfo", { vehicleno });
  } catch {
    return null;
  }
}

const VEHICLE_SET_TTL_MS = 5 * 60 * 1000;

export async function getProvisionedVehicleSet(): Promise<Set<string>> {
  const now = Date.now();
  const cached = global.__vehicleSet;
  if (cached && now - cached.fetchedAt < VEHICLE_SET_TTL_MS) return cached.set;
  try {
    const list = await call<{ vehicleno: string }[]>("listvehicles", {});
    const set = new Set<string>((list || []).map((v) => v.vehicleno));
    global.__vehicleSet = { fetchedAt: now, set };
    return set;
  } catch {
    return cached?.set ?? new Set();
  }
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
