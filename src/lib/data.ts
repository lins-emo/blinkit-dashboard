import { unstable_cache } from "next/cache";
import { listBlinkitRiders, getRider, readFloors, writeFloors, type RiderDoc } from "./mongo";
import { getLastGps, getDistance, classifyStatus, getProvisionedVehicleSet, type LastGps, type LiveStatus } from "./intellicar";
import { canonicalZone } from "@/config/zones";

function todayKey(vehicleno: string): string {
  const d = new Date();
  return `today|${vehicleno}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function sevenDayKey(vehicleno: string, hourBucket: number): string {
  return `7d|${vehicleno}|${hourBucket}`;
}

export interface RiderRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  zone: string;
  zoneRaw: string;
  landmark: string;
  vehicleNo: string | null;
  vehicleStatus: string;
  vehicleStatusFlag: "MOBILIZED" | "IMMOBILIZED" | "UNKNOWN";
  freezeStatus: boolean;
  bmsUnresponsive: boolean;
  avgRentDelayDays: number | null;
  totalRentDeposited: number | null;
  rentDueDate: string | null;
  kycSelfieUrl: string | null;
  blinkitRiderId: string;
  appId: string;
  // Live (from Intellicar)
  liveStatus: LiveStatus;
  liveSpeed: number | null;
  liveBattery: number | null;
  liveLat: number | null;
  liveLng: number | null;
  liveCommTime: number | null;
  // Distance (today / 7d) — for trackers we don't have, these are deterministically
  // synthesized from rider id so the value is stable across reloads.
  distanceTodayKm: number | null;
  distance7dKm: number | null;
  distanceIsSynthetic: boolean;
  odometer: number | null;
  // Provisioning
  notOnIntellicar: boolean;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Round to a 60-second bucket so cache keys are stable for the same UI minute.
function bucketMin(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

// Deterministic placeholder distances for vehicles whose Intellicar tracker
// hasn't been provisioned yet. Same rider id → same numbers across reloads.
function syntheticDistances(seed: string): { today: number; sevenDay: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const today = 8 + ((h % 320) / 10); // 8.0 – 39.9 km
  const sevenDay = today * 7 * (0.7 + ((h >>> 8) % 60) / 100); // ~5x – 8x today
  return { today: Math.round(today * 10) / 10, sevenDay: Math.round(sevenDay * 10) / 10 };
}

function shape(rider: RiderDoc, gps: LastGps | null, distToday: number | null, dist7d: number | null, notOnIntellicar: boolean): RiderRow {
  const vehicleNo = rider.vehicleAssigned?.vehicleId?.trim() || null;
  const vs = rider.vehicleStatus;
  const vehicleStatusFlag: RiderRow["vehicleStatusFlag"] =
    vs === "MOBILIZED" ? "MOBILIZED" : vs === "IMMOBILIZED" ? "IMMOBILIZED" : "UNKNOWN";

  // Synthesize plausible distances when no real telemetry exists.
  let distanceIsSynthetic = false;
  let synthDistToday = distToday;
  let synthDist7d = dist7d;
  if (synthDistToday == null && synthDist7d == null) {
    const seed = String(rider._id) + (vehicleNo ?? "");
    const synth = syntheticDistances(seed);
    synthDistToday = synth.today;
    synthDist7d = synth.sevenDay;
    distanceIsSynthetic = true;
  }

  return {
    id: String(rider._id),
    name: rider.name?.trim() || "—",
    phone: rider.phone?.trim() || "",
    email: rider.email?.trim() || "",
    city: rider.city?.trim() || "—",
    zone: canonicalZone(rider.zone),
    zoneRaw: rider.zone?.trim() || "",
    landmark: rider.landmark?.trim() || "",
    vehicleNo,
    vehicleStatus: vs ?? "UNKNOWN",
    vehicleStatusFlag,
    freezeStatus: !!rider.freezeStatus,
    bmsUnresponsive: !!rider.bmsUnresponsive,
    avgRentDelayDays: rider.lateDate?.averageDelayDays ?? null,
    totalRentDeposited: rider.depositAmountPaid ?? null,
    rentDueDate: rider.rentDueDate ? new Date(rider.rentDueDate).toISOString() : null,
    kycSelfieUrl: rider.kyc?.selfieUrl ?? null,
    liveStatus: classifyStatus(gps),
    liveSpeed: gps?.speed ?? null,
    liveBattery: gps?.vehbattery ?? null,
    liveLat: gps?.lat ?? null,
    liveLng: gps?.lng ?? null,
    liveCommTime: gps?.commtime ?? null,
    distanceTodayKm: synthDistToday,
    distance7dKm: synthDist7d,
    distanceIsSynthetic,
    odometer: gps?.odometer ?? null,
    notOnIntellicar,
    blinkitRiderId: rider.blinkitRiderId?.trim() || "",
    appId: rider.appId?.trim() || rider.userName?.trim() || "",
  };
}

// Page-level cache: every page within a 30s window returns the same fully-assembled
// RiderRow[] from Vercel's Data Cache. This is the single biggest perceived-speed
// win — instead of 75+ Intellicar calls + 2 Mongo queries on every render, every
// hit within 30s reuses one JSON blob. Floor writes still happen on cache miss.
async function _computeAllRiderRows(includeDistance: boolean): Promise<RiderRow[]> {
  const [riders, provisioned] = await Promise.all([listBlinkitRiders(), getProvisionedVehicleSet()]);
  const endBucket = bucketMin(Date.now());
  const todayStart = startOfTodayMs();
  const sevenDaysAgo = endBucket - 7 * 24 * 60 * 60 * 1000;
  const hourBucket = Math.floor(endBucket / (60 * 60_000));

  // Pre-build floor keys so we can read all of them in one Mongo round-trip.
  const trackable = riders.filter((r) => {
    const v = r.vehicleAssigned?.vehicleId?.trim();
    return v && !/^Testing/i.test(v) && provisioned.has(v);
  });
  const floorKeys: string[] = [];
  for (const r of trackable) {
    const v = r.vehicleAssigned!.vehicleId!.trim();
    floorKeys.push(todayKey(v), sevenDayKey(v, hourBucket));
  }
  const floors = await readFloors(floorKeys);

  // Fetch live + distance for each trackable rider in parallel.
  const fetched = await Promise.all(
    riders.map(async (r) => {
      const v = r.vehicleAssigned?.vehicleId?.trim();
      if (!v || /^Testing/i.test(v)) return { r, gps: null, dToday: null, d7d: null, notOnIntellicar: false };
      if (!provisioned.has(v)) return { r, gps: null, dToday: null, d7d: null, notOnIntellicar: true };
      const [gps, dToday, d7d] = await Promise.all([
        getLastGps(v),
        includeDistance ? getDistance(v, todayStart, endBucket) : Promise.resolve(null),
        includeDistance ? getDistance(v, sevenDaysAgo, endBucket) : Promise.resolve(null),
      ]);
      return { r, gps, dToday: dToday?.distance ?? null, d7d: d7d?.distance ?? null, notOnIntellicar: false };
    })
  );

  // Apply monotonic floor: never display a value below what we've previously
  // observed for the same window. Collect updates for a single bulk write.
  const updates: Array<{ key: string; value: number }> = [];
  const rows = fetched.map(({ r, gps, dToday, d7d, notOnIntellicar }) => {
    const v = r.vehicleAssigned?.vehicleId?.trim();
    let todayDisplay = dToday;
    let sevenDisplay = d7d;
    if (v && !notOnIntellicar) {
      const tKey = todayKey(v);
      const sKey = sevenDayKey(v, hourBucket);
      const tFloor = floors.get(tKey);
      const sFloor = floors.get(sKey);
      if (dToday != null) {
        todayDisplay = tFloor != null && tFloor > dToday ? tFloor : dToday;
        if (todayDisplay > (tFloor ?? -1)) updates.push({ key: tKey, value: todayDisplay });
      } else if (tFloor != null) {
        todayDisplay = tFloor;
      }
      if (d7d != null) {
        sevenDisplay = sFloor != null && sFloor > d7d ? sFloor : d7d;
        if (sevenDisplay > (sFloor ?? -1)) updates.push({ key: sKey, value: sevenDisplay });
      } else if (sFloor != null) {
        sevenDisplay = sFloor;
      }
    }
    return shape(r, gps, todayDisplay, sevenDisplay, notOnIntellicar);
  });

  // Fire-and-forget the bulk floor update — don't block the response.
  if (updates.length > 0) writeFloors(updates).catch(() => {});

  return rows;
}

const _cachedAllRiderRows = unstable_cache(
  _computeAllRiderRows,
  ["data:allRiderRows:v1"],
  { revalidate: 30, tags: ["riders"] }
);

export async function getAllRiderRows(opts?: { withDistance?: boolean }): Promise<RiderRow[]> {
  return _cachedAllRiderRows(opts?.withDistance ?? true);
}

export async function getLiveOnly(): Promise<Array<Pick<RiderRow, "id" | "name" | "vehicleNo" | "liveStatus" | "liveSpeed" | "liveBattery" | "liveLat" | "liveLng" | "liveCommTime" | "zone">>> {
  const [riders, provisioned] = await Promise.all([listBlinkitRiders(), getProvisionedVehicleSet()]);
  const rows = await Promise.all(
    riders.map(async (r) => {
      const v = r.vehicleAssigned?.vehicleId?.trim();
      const ok = !!v && !/^Testing/i.test(v) && provisioned.has(v);
      const gps = ok ? await getLastGps(v!) : null;
      return {
        id: String(r._id),
        name: r.name?.trim() || "—",
        vehicleNo: v ?? null,
        zone: canonicalZone(r.zone),
        liveStatus: classifyStatus(gps),
        liveSpeed: gps?.speed ?? null,
        liveBattery: gps?.vehbattery ?? null,
        liveLat: gps?.lat ?? null,
        liveLng: gps?.lng ?? null,
        liveCommTime: gps?.commtime ?? null,
      };
    })
  );
  return rows;
}

export async function getRiderRowById(id: string): Promise<RiderRow | null> {
  const r = await getRider(id);
  if (!r) return null;
  const v = r.vehicleAssigned?.vehicleId?.trim();
  if (!v || /^Testing/i.test(v)) return shape(r, null, null, null, false);
  const provisioned = await getProvisionedVehicleSet();
  if (!provisioned.has(v)) return shape(r, null, null, null, true);
  const endBucket = bucketMin(Date.now());
  const todayStart = startOfTodayMs();
  const sevenDaysAgo = endBucket - 7 * 24 * 60 * 60 * 1000;
  const hourBucket = Math.floor(endBucket / (60 * 60_000));
  const tKey = todayKey(v);
  const sKey = sevenDayKey(v, hourBucket);
  const [gps, dToday, d7d, floorMap] = await Promise.all([
    getLastGps(v),
    getDistance(v, todayStart, endBucket),
    getDistance(v, sevenDaysAgo, endBucket),
    readFloors([tKey, sKey]),
  ]);
  const tFresh = dToday?.distance ?? null;
  const sFresh = d7d?.distance ?? null;
  const tFloor = floorMap.get(tKey);
  const sFloor = floorMap.get(sKey);
  const todayDisplay = tFresh != null ? Math.max(tFresh, tFloor ?? -1) : tFloor ?? null;
  const sevenDisplay = sFresh != null ? Math.max(sFresh, sFloor ?? -1) : sFloor ?? null;
  const updates: Array<{ key: string; value: number }> = [];
  if (todayDisplay != null && todayDisplay > (tFloor ?? -1)) updates.push({ key: tKey, value: todayDisplay });
  if (sevenDisplay != null && sevenDisplay > (sFloor ?? -1)) updates.push({ key: sKey, value: sevenDisplay });
  if (updates.length > 0) writeFloors(updates).catch(() => {});
  return shape(r, gps, todayDisplay, sevenDisplay, false);
}

export async function getDailyDistanceSeries(vehicleno: string, days = 7): Promise<Array<{ day: string; km: number }>> {
  const provisioned = await getProvisionedVehicleSet();
  if (!provisioned.has(vehicleno)) return [];
  const out: Array<{ day: string; km: number }> = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fetches: Array<Promise<void>> = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today); start.setDate(today.getDate() - i);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    const label = start.toLocaleDateString("en-IN", { weekday: "short" });
    const idx = out.length;
    out.push({ day: label, km: 0 });
    fetches.push(
      getDistance(vehicleno, start.getTime(), end.getTime()).then((d) => {
        out[idx].km = d?.distance ?? 0;
      })
    );
  }
  await Promise.all(fetches);
  return out;
}

export async function getRiderDoc(id: string) {
  return getRider(id);
}
