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

async function _fetchReportBatch(identifiers: string[], dates: string[]): Promise<Record<string, Record<string, ReportData>>> {
  return callJson(`/reports/batch`, {
    method: "POST",
    body: JSON.stringify({ identifiers, dates, queryBy: "deviceId" }),
  });
}
// We cache by the serialized inputs (unstable_cache hashes the args).
const cachedReportBatch = unstable_cache(
  _fetchReportBatch,
  ["sensiot:reportBatch:v1"],
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

export async function getReportBatch(
  deviceIds: string[],
  dates: string[]
): Promise<Record<string, Record<string, ReportData>>> {
  if (deviceIds.length === 0 || dates.length === 0) return {};
  try { return await cachedReportBatch(deviceIds, dates); }
  catch (e) { console.warn("[sensiot] reportBatch fail", e); return {}; }
}

// ---------- Distance derivation ----------

/** Pack efficiency in km/kWh — used when distance is reported as 0 but energy was consumed. */
export const KM_PER_KWH = 50;

export function distanceFromReport(rep: ReportData | undefined | null): number | null {
  if (!rep) return null;
  if (typeof rep.distanceTraveled === "number" && rep.distanceTraveled > 0) {
    return Math.round(rep.distanceTraveled * 10) / 10;
  }
  // Fallback: derive from energy consumed.
  if (typeof rep.energyConsumed === "number" && rep.energyConsumed > 0) {
    return Math.round(rep.energyConsumed * KM_PER_KWH * 10) / 10;
  }
  return null;
}
