import { unstable_cache } from "next/cache";

const BASE = process.env.SENSIOT_BASE_URL ?? "https://sensiot.emo-energy.com";
const API_KEY = process.env.SENSIOT_API_KEY;

if (!API_KEY) {
  console.warn("[sensiot] SENSIOT_API_KEY not set — all Sensiot calls will fail.");
}

// ---------- Types ----------

export interface DeviceTriple {
  imei: string;
  deviceId: string;     // BMS serial, e.g. "A02022648"
  packId: string;       // pack identifier, e.g. "ZENF2458"
}

export interface ReportData {
  imei: string;
  deviceId: string;
  packId: string;
  date: string;                  // YYYY-MM-DD (IST)
  distanceTraveled: number;      // km
  energyConsumed: number;        // kWh (discharge only)
  cycleIncrement: number;        // cycles added on this day
  dataPoints: number;
}

export interface LiveDevice {
  deviceId: string;
  imei: string;
  packId: string;
  lastSeen: string;
  soc: number;                   // %
  voltage: number;
  current: number;               // A (negative when discharging)
  remainingCapacity: number;
  cellData: number[];            // per-cell V
  temperatureData: number[];     // per-thermistor C
  faults: number[];              // bitmasks
  latitude: number;
  longitude: number;
  speed: number;                 // km/h
  cycleCount: number;
  dataType: string;
  iccid?: string;
  imsi?: string;
  networkOperator?: string;
  isMoving: boolean;
  packMetrics?: {
    packId: string;
    date: string;
    distanceKm: number;
    energyKwh: number;
    cycleIncrement: number;
    dataPoints: number;
    firstSeen: string;
    lastSeen: string;
  };
}

// ---------- Helpers ----------

/** Return the IST date string (YYYY-MM-DD) `daysAgo` days before today. */
export function istDate(daysAgo = 0): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ms = Date.now() + istOffsetMs - daysAgo * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function last7DaysIST(): string[] {
  return Array.from({ length: 7 }, (_, i) => istDate(i));
}

async function callJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!API_KEY) throw new Error("SENSIOT_API_KEY missing");
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...opts,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`sensiot ${path} -> ${res.status} ${await res.text().catch(() => "")}`);
  }
  const j = await res.json();
  if (j?.success !== true) throw new Error(`sensiot ${path} -> success=false ${JSON.stringify(j).slice(0, 200)}`);
  return j.data as T;
}

// ---------- Cached fetchers ----------

async function _fetchBatteries(date: string): Promise<DeviceTriple[]> {
  return callJson<DeviceTriple[]>(`/batteries?dates=${encodeURIComponent(date)}`);
}
const cachedBatteries = unstable_cache(
  _fetchBatteries,
  ["sensiot:batteries:v1"],
  { revalidate: 300, tags: ["sensiot", "batteries"] }
);

async function _fetchLiveAll(): Promise<Record<string, LiveDevice>> {
  return callJson<Record<string, LiveDevice>>(`/live/devices`);
}
const cachedLiveAll = unstable_cache(
  _fetchLiveAll,
  ["sensiot:liveAll:v1"],
  { revalidate: 25, tags: ["sensiot", "live"] }
);

export interface BatchError {
  id: string;        // deviceId or imei (whatever queryBy was)
  date: string;      // YYYY-MM-DD
  error: string;     // truncated to ~200 chars by the backend
}
export interface BatchResult {
  data: Record<string, Record<string, ReportData>>;
  failedPairs: number;
  failedIds: string[];   // distinct ids that had ≥1 failure
  errors: BatchError[];  // capped at 50 by the backend
}

// Lower-level fetch returns the full envelope (data + meta) so callers can see
// which pairs the backend failed to compute vs which legitimately have no data.
async function _fetchReportBatchFull(identifiers: string[], dates: string[]): Promise<BatchResult> {
  if (!API_KEY) throw new Error("SENSIOT_API_KEY missing");
  const res = await fetch(`${BASE}/api/v1/reports/batch`, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers, dates, queryBy: "deviceId" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`sensiot /reports/batch -> ${res.status} ${await res.text().catch(() => "")}`);
  const j = await res.json();
  if (j?.success !== true) throw new Error(`sensiot /reports/batch -> success=false ${JSON.stringify(j).slice(0, 200)}`);
  return {
    data: j.data ?? {},
    failedPairs: j.meta?.failedPairs ?? 0,
    failedIds:   j.meta?.failedIds   ?? [],
    errors:      j.meta?.errors      ?? [],
  };
}

const cachedReportBatchFull = unstable_cache(
  _fetchReportBatchFull,
  ["sensiot:reportBatchFull:v1"],
  { revalidate: 60, tags: ["sensiot", "reports"] }
);

// ---------- Public API (errors → null/empty, never cached) ----------

export async function getDeviceTriples(date?: string): Promise<DeviceTriple[]> {
  const d = date ?? istDate(0);
  try { return await cachedBatteries(d); } catch (e) { console.warn("[sensiot] batteries fail", e); return []; }
}

export async function getLiveAll(): Promise<Record<string, LiveDevice>> {
  try { return await cachedLiveAll(); } catch (e) { console.warn("[sensiot] liveAll fail", e); return {}; }
}

/** Backward-compatible shape — just the data, errors silently ignored. */
export async function getReportBatch(
  deviceIds: string[],
  dates: string[]
): Promise<Record<string, Record<string, ReportData>>> {
  return (await getReportBatchFull(deviceIds, dates)).data;
}

/** Full result including per-pair failures from sensbackend. Used by the
 *  export route to surface backend errors to the UI rather than masquerade
 *  them as "no data". */
export async function getReportBatchFull(
  deviceIds: string[],
  dates: string[]
): Promise<BatchResult> {
  if (deviceIds.length === 0 || dates.length === 0) {
    return { data: {}, failedPairs: 0, failedIds: [], errors: [] };
  }
  try { return await cachedReportBatchFull(deviceIds, dates); }
  catch (e) {
    console.warn("[sensiot] reportBatch fail", e);
    // Whole-call failure (network / auth / 5xx) → treat every pair as failed.
    const errMsg = e instanceof Error ? e.message : String(e);
    const errors: BatchError[] = [];
    outer: for (const id of deviceIds) {
      for (const d of dates) {
        if (errors.length >= 50) break outer;
        errors.push({ id, date: d, error: errMsg.slice(0, 200) });
      }
    }
    return {
      data: {},
      failedPairs: deviceIds.length * dates.length,
      failedIds: [...deviceIds],
      errors,
    };
  }
}

// ---------- Distance derivation ----------

/** Fleet-wide km/kWh constant. Tuned from 50 → 45 based on empirical median across
 *  1631 GREEN pack-days in the 14-day BNC audit. */
export const KM_PER_KWH_FLEET = 45;

/** Cross-validation bounds on the implied km/kWh ratio. Outside this range, the
 *  GPS measurement is almost certainly wrong (multi-path, lost fix, etc.). */
export const RATIO_BOUNDS = { min: 5, max: 150 } as const;

export type DistanceSource =
  | "sensiot-gps"               // real GPS haversine, implied km/kWh in bounds
  | "sensiot-energy-pack"       // derived from energy × per-pack median (used when no GPS, or GPS implied ratio is impossible)
  | "sensiot-energy-fleet"      // derived from energy × fleet constant (45)
  | "intellicar"                // fallback from Intellicar
  | "synthetic"                 // deterministic placeholder (UI only)
  | "backend-error"             // sensbackend returned an error for this pair (not the same as "no data")
  | "none";                     // no data anywhere

export interface DistanceWithSource {
  km: number | null;
  source: DistanceSource;
}

/** Resolve a single pack-day report into a displayable km value + source flag.
 *  Pass `perPackKmPerKwh` if the pack has a stable per-pack efficiency available.
 *
 *  Logic:
 *    1. Both km and energy present → check implied km/kWh ratio.
 *       - in bounds → trust GPS km.
 *       - out of bounds → GPS is wrong; CORRECT it with energy × ratio
 *         (per-pack ratio if available, else fleet constant).
 *    2. Only km present (no energy) → no cross-check possible, trust GPS.
 *    3. Only energy present → derive km from energy × ratio.
 *    4. Neither → null. */
export function distanceFromReport(
  rep: ReportData | undefined | null,
  perPackKmPerKwh?: number
): DistanceWithSource {
  if (!rep) return { km: null, source: "none" };
  const km = typeof rep.distanceTraveled === "number" ? rep.distanceTraveled : 0;
  const e  = typeof rep.energyConsumed  === "number" ? rep.energyConsumed  : 0;

  const energyDerived = (): DistanceWithSource => {
    if (perPackKmPerKwh && perPackKmPerKwh > 0) {
      return { km: Math.round(e * perPackKmPerKwh * 10) / 10, source: "sensiot-energy-pack" };
    }
    return { km: Math.round(e * KM_PER_KWH_FLEET * 10) / 10, source: "sensiot-energy-fleet" };
  };

  if (km > 0 && e > 0) {
    const ratio = km / e;
    if (ratio >= RATIO_BOUNDS.min && ratio <= RATIO_BOUNDS.max) {
      return { km: Math.round(km * 10) / 10, source: "sensiot-gps" };
    }
    // Suspicious GPS → correct with energy-derived value
    return energyDerived();
  }
  if (km > 0) {
    return { km: Math.round(km * 10) / 10, source: "sensiot-gps" };
  }
  if (e > 0) {
    return energyDerived();
  }
  return { km: null, source: "none" };
}

// ---------- Per-pack efficiency (km/kWh) — cached 24 h ----------

const PACK_EFF_WINDOW_DAYS = 14;
const PACK_EFF_MIN_SAMPLES = 10;

async function _computePackEfficiencies(deviceIds: string[]): Promise<Record<string, number>> {
  if (deviceIds.length === 0) return {};
  const dates = Array.from({ length: PACK_EFF_WINDOW_DAYS }, (_, i) =>
    istDate(PACK_EFF_WINDOW_DAYS - 1 - i)
  );
  const reports = await getReportBatch(deviceIds, dates);
  const out: Record<string, number> = {};
  for (const [devId, byDate] of Object.entries(reports)) {
    const ratios: number[] = [];
    for (const rep of Object.values(byDate)) {
      const km = Number(rep.distanceTraveled || 0);
      const e  = Number(rep.energyConsumed  || 0);
      if (km > 0.5 && e > 0.1) {
        const r = km / e;
        if (r >= RATIO_BOUNDS.min && r <= RATIO_BOUNDS.max) ratios.push(r);
      }
    }
    if (ratios.length >= PACK_EFF_MIN_SAMPLES) {
      ratios.sort((a, b) => a - b);
      out[devId] = ratios[Math.floor(ratios.length / 2)];
    }
  }
  return out;
}

const cachedPackEfficiencies = unstable_cache(
  _computePackEfficiencies,
  ["sensiot:packEfficiencies:v1"],
  { revalidate: 86400, tags: ["sensiot", "efficiency"] }
);

export async function getPackEfficiencies(deviceIds: string[]): Promise<Map<string, number>> {
  try {
    // Sort for cache-key stability
    const obj = await cachedPackEfficiencies([...new Set(deviceIds)].sort());
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}
