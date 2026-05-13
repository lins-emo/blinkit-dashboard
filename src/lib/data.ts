import { unstable_cache } from "next/cache";
import { listBlinkitRiders, getRider, getPackInfoForVehicles, readFloors, writeFloors, type RiderDoc, type PackInfo } from "./mongo";
import { getDeviceTriples, getLiveAll, getReportBatch, distanceFromReport, istDate, last7DaysIST, type LiveDevice } from "./sensiot";
import { getIntellicarVehicleSet, getIntellicarDistance } from "./intellicar";
import { canonicalZone } from "@/config/zones";

function todayKey(vehicleno: string): string {
  return `today|${vehicleno}|${istDate(0)}`;
}
function sevenDayKey(vehicleno: string, hourBucket: number): string {
  return `7d|${vehicleno}|${hourBucket}`;
}

export type LiveStatus = "on-trip" | "idle" | "parked" | "offline" | "unknown";

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
  // Pack identification
  batteryId: string;
  bmsId: string;
  packId: string;
  packModel: string;
  packVendor: string;
  packStatus: string;
  // Live (from Sensiot)
  liveStatus: LiveStatus;
  liveSpeed: number | null;
  liveBattery: number | null;       // SOC %
  liveLat: number | null;
  liveLng: number | null;
  liveCommTime: number | null;
  cycleCount: number | null;
  faultsActive: number;             // count of non-zero fault bytes
  packVoltage: number | null;
  packCurrent: number | null;       // A — negative when discharging
  packRemainingCapacity: number | null;
  cellSpreadMv: number | null;      // (max - min) cell voltage in mV
  maxTempC: number | null;
  minTempC: number | null;
  // Distance
  distanceTodayKm: number | null;
  distance7dKm: number | null;
  distanceIsSynthetic: boolean;
  distanceFromEnergy: boolean;      // true if derived from kWh × 50 km/kWh fallback
  energyTodayKwh: number | null;
  odometer: number | null;          // not provided by Sensiot — null
  // Internal — never surfaced to UI
  notOnSensiot: boolean;
}

function startOfTodayMs(): number {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

// Reject obvious bad values in the BMS ID column ("BMS ID" placeholder, "0", "-", "invalid", etc.)
function isValidBmsId(v: string | undefined): v is string {
  if (!v) return false;
  const t = v.trim();
  if (t.length < 5) return false;
  if (/^(BMS ?ID|invalid|none|n\/a|-|0+)$/i.test(t)) return false;
  return true;
}

// Deterministic placeholder distances for vehicles with no data anywhere.
function syntheticDistances(seed: string): { today: number; sevenDay: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const today = 8 + ((h % 320) / 10);                                       // 8.0 – 39.9 km
  const sevenDay = today * 7 * (0.7 + ((h >>> 8) % 60) / 100);              // ~5×–8× today
  return { today: Math.round(today * 10) / 10, sevenDay: Math.round(sevenDay * 10) / 10 };
}

function classifySensiot(live: LiveDevice | null): LiveStatus {
  if (!live) return "unknown";
  const lastSeenMs = parseLastSeen(live.lastSeen);
  const ageMs = Date.now() - lastSeenMs;
  if (ageMs > 10 * 60_000) return "offline";
  // faults[0] === 3 = discharging (riding). isMoving = debounced.
  if (live.faults?.[0] === 3 || live.speed > 5) return "on-trip";
  if (live.isMoving) return "idle";
  return "parked";
}

// Sensiot lastSeen is in IST formatted as "YYYY-MM-DD HH:mm:ss" — parse to ms.
function parseLastSeen(s: string | undefined): number {
  if (!s) return 0;
  // Treat as IST.
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const [, Y, Mo, D, h, mi, se] = m;
  const utcMs = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +se);
  return utcMs - 5.5 * 60 * 60 * 1000;
}

function countActiveFaults(faults: number[] | undefined): number {
  if (!faults) return 0;
  // faults[0] === 3 is just "discharging" — not a real fault.
  return faults.filter((f, i) => f !== 0 && !(i === 0 && f === 3)).length;
}

function cellSpreadMv(cells: number[] | undefined): number | null {
  if (!cells || cells.length < 2) return null;
  const nz = cells.filter((c) => c > 0);
  if (nz.length < 2) return null;
  return Math.round((Math.max(...nz) - Math.min(...nz)) * 1000);
}

function tempStat(temps: number[] | undefined, kind: "max" | "min"): number | null {
  if (!temps || temps.length === 0) return null;
  const nz = temps.filter((t) => t > -50 && t < 150);
  if (nz.length === 0) return null;
  return Math.round((kind === "max" ? Math.max(...nz) : Math.min(...nz)) * 10) / 10;
}

interface ShapeInputs {
  rider: RiderDoc;
  pack: PackInfo | null;
  live: LiveDevice | null;
  distToday: number | null;
  dist7d: number | null;
  todayFromEnergy: boolean;
  notOnSensiot: boolean;
}

function shape({ rider, pack, live, distToday, dist7d, todayFromEnergy, notOnSensiot }: ShapeInputs): RiderRow {
  const vehicleNo = rider.vehicleAssigned?.vehicleId?.trim() || null;
  const vs = rider.vehicleStatus;
  const vehicleStatusFlag: RiderRow["vehicleStatusFlag"] =
    vs === "MOBILIZED" ? "MOBILIZED" : vs === "IMMOBILIZED" ? "IMMOBILIZED" : "UNKNOWN";

  // Synthesize plausible distances when no real telemetry exists at all.
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
    blinkitRiderId: rider.blinkitRiderId?.trim() || "",
    appId: rider.appId?.trim() || rider.userName?.trim() || "",
    batteryId: pack?.batteryId || pack?.batterySerial || "",
    bmsId: pack?.bmsId || "",
    packId: pack?.packId || pack?.batteryId || "",
    packModel: pack?.model || "",
    packVendor: pack?.vendor || "",
    packStatus: pack?.batteryStatus || pack?.status || "",
    liveStatus: classifySensiot(live),
    liveSpeed: live?.speed ?? null,
    liveBattery: live?.soc ?? null,
    liveLat: live?.latitude ?? null,
    liveLng: live?.longitude ?? null,
    liveCommTime: live ? parseLastSeen(live.lastSeen) : null,
    cycleCount: live?.cycleCount ?? null,
    faultsActive: countActiveFaults(live?.faults),
    packVoltage: live?.voltage ?? null,
    packCurrent: live?.current ?? null,
    packRemainingCapacity: live?.remainingCapacity ?? null,
    cellSpreadMv: cellSpreadMv(live?.cellData),
    maxTempC: tempStat(live?.temperatureData, "max"),
    minTempC: tempStat(live?.temperatureData, "min"),
    distanceTodayKm: synthDistToday,
    distance7dKm: synthDist7d,
    distanceIsSynthetic,
    distanceFromEnergy: todayFromEnergy,
    energyTodayKwh: live?.packMetrics?.energyKwh ?? null,
    odometer: null,
    notOnSensiot,
  };
}

// Resolve which Sensiot deviceId corresponds to each rider.
// Priority: pack.bmsId (direct deviceId match) → packId-via-/batteries lookup.
async function resolveDeviceIds(packs: Record<string, PackInfo>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const triples = await getDeviceTriples();
  const byPackId = new Map<string, string>();    // packId → deviceId
  const byImei = new Map<string, string>();       // imei → deviceId
  const knownDeviceIds = new Set<string>();
  for (const t of triples) {
    if (t.packId) byPackId.set(t.packId, t.deviceId);
    if (t.imei) byImei.set(t.imei, t.deviceId);
    knownDeviceIds.add(t.deviceId);
  }
  for (const [vehicleId, pack] of Object.entries(packs)) {
    if (pack.bmsId && knownDeviceIds.has(pack.bmsId)) {
      out[vehicleId] = pack.bmsId;
      continue;
    }
    if (pack.batteryId && byPackId.has(pack.batteryId)) {
      out[vehicleId] = byPackId.get(pack.batteryId)!;
      continue;
    }
    if (pack.batterySerial && byPackId.has(pack.batterySerial)) {
      out[vehicleId] = byPackId.get(pack.batterySerial)!;
    }
  }
  return out;
}

async function _computeAllRiderRows(): Promise<RiderRow[]> {
  const riders = await listBlinkitRiders();
  const realVehicleIds = riders
    .map((r) => r.vehicleAssigned?.vehicleId?.trim())
    .filter((v): v is string => !!v && !/^Testing/i.test(v));

  // Parallel: pack info (Mongo), Sensiot live, Sensiot device triples, Intellicar vehicle set
  const [packs, liveAll, triples, intellicarVehicles] = await Promise.all([
    getPackInfoForVehicles(realVehicleIds),
    getLiveAll(),
    getDeviceTriples(),
    getIntellicarVehicleSet(),
  ]);

  // Build vehicleId → deviceId resolution.
  // PRIMARY: trust pack.bmsId directly as the Sensiot deviceId — the report endpoint
  // accepts any well-formed BMS serial regardless of whether the pack was active
  // recently. (The /batteries response only lists devices active on a given date,
  // so gating on it dropped ~24 perfectly valid packs.)
  // FALLBACK: when bmsId is empty or obviously invalid, look up the packId in the
  // /batteries triples to find a deviceId mapping.
  const byPackId = new Map<string, string>();
  for (const t of triples) {
    if (t.packId) byPackId.set(t.packId, t.deviceId);
  }
  const vehicleToDevice: Record<string, string> = {};
  for (const [vid, pack] of Object.entries(packs)) {
    if (isValidBmsId(pack.bmsId)) vehicleToDevice[vid] = pack.bmsId;
    else if (pack.batteryId && byPackId.has(pack.batteryId)) vehicleToDevice[vid] = byPackId.get(pack.batteryId)!;
    else if (pack.batterySerial && byPackId.has(pack.batterySerial)) vehicleToDevice[vid] = byPackId.get(pack.batterySerial)!;
  }

  const deviceIds = [...new Set(Object.values(vehicleToDevice))];

  // Pull today + last 7 days distance in ONE batch call.
  const dates = last7DaysIST();
  const reportBatch = deviceIds.length > 0 ? await getReportBatch(deviceIds, dates) : {};

  const today = istDate(0);
  const sevenDays = dates;

  // For vehicles Sensiot doesn't cover (no deviceId), look up Intellicar fallback
  // in parallel. Single Intellicar call per missing vehicle, 60s cached.
  const sensiotMissingVehicles = realVehicleIds.filter((vid) => !vehicleToDevice[vid]);
  const intellicarMissing = sensiotMissingVehicles.filter((vid) => intellicarVehicles.has(vid));
  const startOfTodayUtc = startOfTodayMs();
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 86_400_000;
  const intellicarResults = await Promise.all(
    intellicarMissing.map(async (vid) => {
      const [today, seven] = await Promise.all([
        getIntellicarDistance(vid, startOfTodayUtc, nowMs),
        getIntellicarDistance(vid, sevenDaysAgoMs, nowMs),
      ]);
      return { vid, today: today?.distance ?? null, seven: seven?.distance ?? null };
    })
  );
  const intellicarByVehicle = new Map(intellicarResults.map((r) => [r.vid, r]));

  // Floors (Mongo, cross-lambda monotonic)
  const endBucket = Math.floor(Date.now() / 60_000) * 60_000;
  const hourBucket = Math.floor(endBucket / (60 * 60_000));
  const floorKeys: string[] = [];
  for (const v of Object.keys(vehicleToDevice)) {
    floorKeys.push(todayKey(v), sevenDayKey(v, hourBucket));
  }
  const floors = await readFloors(floorKeys);
  const floorUpdates: Array<{ key: string; value: number }> = [];

  const rows = riders.map((r) => {
    const vid = r.vehicleAssigned?.vehicleId?.trim();
    if (!vid || /^Testing/i.test(vid)) {
      return shape({ rider: r, pack: null, live: null, distToday: null, dist7d: null, todayFromEnergy: false, notOnSensiot: false });
    }
    const pack = packs[vid] ?? null;
    const deviceId = vehicleToDevice[vid];
    if (!deviceId) {
      // Sensiot doesn't cover this vehicle — try Intellicar fallback.
      const ic = intellicarByVehicle.get(vid);
      if (ic && (ic.today != null || ic.seven != null)) {
        // Apply monotonic floor before returning.
        const tKey = todayKey(vid);
        const sKey = sevenDayKey(vid, hourBucket);
        const tFloor = floors.get(tKey);
        const sFloor = floors.get(sKey);
        let icToday = ic.today;
        let icSeven = ic.seven;
        if (icToday != null) {
          if (tFloor != null && tFloor > icToday) icToday = tFloor;
          if (icToday > (tFloor ?? -1)) floorUpdates.push({ key: tKey, value: icToday });
        } else if (tFloor != null) icToday = tFloor;
        if (icSeven != null) {
          if (sFloor != null && sFloor > icSeven) icSeven = sFloor;
          if (icSeven > (sFloor ?? -1)) floorUpdates.push({ key: sKey, value: icSeven });
        } else if (sFloor != null) icSeven = sFloor;
        return shape({ rider: r, pack, live: null, distToday: icToday, dist7d: icSeven, todayFromEnergy: false, notOnSensiot: true });
      }
      return shape({ rider: r, pack, live: null, distToday: null, dist7d: null, todayFromEnergy: false, notOnSensiot: true });
    }
    const live = liveAll[deviceId] ?? null;
    const reportsForDevice = reportBatch[deviceId] ?? {};

    // Today distance (with energy fallback)
    const todayReport = reportsForDevice[today];
    let todayDistance = distanceFromReport(todayReport);
    const todayFromEnergy =
      !!todayReport &&
      (!todayReport.distanceTraveled || todayReport.distanceTraveled <= 0) &&
      todayDistance !== null;

    // 7-day distance: sum over the 7 days, with energy fallback for any zero-distance day
    let sevenDistance: number | null = null;
    for (const date of sevenDays) {
      const rep = reportsForDevice[date];
      const d = distanceFromReport(rep);
      if (d != null) sevenDistance = (sevenDistance ?? 0) + d;
    }
    if (sevenDistance != null) sevenDistance = Math.round(sevenDistance * 10) / 10;

    // Apply monotonic floor (cross-lambda safe via Mongo)
    const tKey = todayKey(vid);
    const sKey = sevenDayKey(vid, hourBucket);
    const tFloor = floors.get(tKey);
    const sFloor = floors.get(sKey);
    if (todayDistance != null) {
      if (tFloor != null && tFloor > todayDistance) todayDistance = tFloor;
      if (todayDistance > (tFloor ?? -1)) floorUpdates.push({ key: tKey, value: todayDistance });
    } else if (tFloor != null) {
      todayDistance = tFloor;
    }
    if (sevenDistance != null) {
      if (sFloor != null && sFloor > sevenDistance) sevenDistance = sFloor;
      if (sevenDistance > (sFloor ?? -1)) floorUpdates.push({ key: sKey, value: sevenDistance });
    } else if (sFloor != null) {
      sevenDistance = sFloor;
    }

    return shape({
      rider: r,
      pack,
      live,
      distToday: todayDistance,
      dist7d: sevenDistance,
      todayFromEnergy,
      notOnSensiot: false,
    });
  });

  if (floorUpdates.length > 0) writeFloors(floorUpdates).catch(() => {});

  return rows;
}

const _cachedAllRiderRows = unstable_cache(
  _computeAllRiderRows,
  ["data:allRiderRows:v2"],
  { revalidate: 30, tags: ["riders"] }
);

export async function getAllRiderRows(): Promise<RiderRow[]> {
  return _cachedAllRiderRows();
}

export async function getLiveOnly(): Promise<Array<Pick<RiderRow, "id" | "name" | "vehicleNo" | "liveStatus" | "liveSpeed" | "liveBattery" | "liveLat" | "liveLng" | "liveCommTime" | "zone">>> {
  const rows = await getAllRiderRows();
  return rows.map(({ id, name, vehicleNo, liveStatus, liveSpeed, liveBattery, liveLat, liveLng, liveCommTime, zone }) =>
    ({ id, name, vehicleNo, liveStatus, liveSpeed, liveBattery, liveLat, liveLng, liveCommTime, zone }));
}

export async function getRiderRowById(id: string): Promise<RiderRow | null> {
  const rows = await getAllRiderRows();
  return rows.find((r) => r.id === id) ?? null;
}

export async function getRiderDoc(id: string) {
  return getRider(id);
}

// Per-rider daily distance series (last N days) for the sparkline.
export async function getDailyDistanceSeries(vehicleId: string, days = 7): Promise<Array<{ day: string; km: number }>> {
  // Resolve deviceId for this single vehicle.
  const [packs, triples] = await Promise.all([
    getPackInfoForVehicles([vehicleId]),
    getDeviceTriples(),
  ]);
  const pack = packs[vehicleId];
  if (!pack) return [];
  let deviceId: string | undefined;
  const byPackId = new Map(triples.map((t) => [t.packId, t.deviceId]));
  const knownDeviceIds = new Set(triples.map((t) => t.deviceId));
  if (pack.bmsId && knownDeviceIds.has(pack.bmsId)) deviceId = pack.bmsId;
  else if (pack.batteryId && byPackId.has(pack.batteryId)) deviceId = byPackId.get(pack.batteryId);
  if (!deviceId) return [];

  const dates: string[] = Array.from({ length: days }, (_, i) => istDate(days - 1 - i));
  const reports = await getReportBatch([deviceId], dates);
  const byDate = reports[deviceId] ?? {};
  return dates.map((d) => {
    const km = distanceFromReport(byDate[d]) ?? 0;
    const dayLabel = new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
    return { day: dayLabel, km };
  });
}
