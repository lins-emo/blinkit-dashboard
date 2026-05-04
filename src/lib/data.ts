import { listBlinkitRiders, getRider, type RiderDoc } from "./mongo";
import { getLastGps, getDistance, classifyStatus, getProvisionedVehicleSet, type LastGps, type LiveStatus } from "./intellicar";
import { canonicalZone } from "@/config/zones";

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
  // Live (from Intellicar)
  liveStatus: LiveStatus;
  liveSpeed: number | null;
  liveBattery: number | null;
  liveLat: number | null;
  liveLng: number | null;
  liveCommTime: number | null;
  // Distance (today / 7d)
  distanceTodayKm: number | null;
  distance7dKm: number | null;
  odometer: number | null;
  // Provisioning
  notOnIntellicar: boolean;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function shape(rider: RiderDoc, gps: LastGps | null, distToday: number | null, dist7d: number | null, notOnIntellicar: boolean): RiderRow {
  const vehicleNo = rider.vehicleAssigned?.vehicleId?.trim() || null;
  const vs = rider.vehicleStatus;
  const vehicleStatusFlag: RiderRow["vehicleStatusFlag"] =
    vs === "MOBILIZED" ? "MOBILIZED" : vs === "IMMOBILIZED" ? "IMMOBILIZED" : "UNKNOWN";
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
    distanceTodayKm: distToday,
    distance7dKm: dist7d,
    odometer: gps?.odometer ?? null,
    notOnIntellicar,
  };
}

export async function getAllRiderRows(opts?: { withDistance?: boolean }): Promise<RiderRow[]> {
  const includeDistance = opts?.withDistance ?? true;
  const [riders, provisioned] = await Promise.all([listBlinkitRiders(), getProvisionedVehicleSet()]);
  const now = Date.now();
  const todayStart = startOfTodayMs();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const rows = await Promise.all(
    riders.map(async (r) => {
      const v = r.vehicleAssigned?.vehicleId?.trim();
      if (!v || /^Testing/i.test(v)) return shape(r, null, null, null, false);
      const onIntellicar = provisioned.has(v);
      if (!onIntellicar) return shape(r, null, null, null, true);
      const [gps, dToday, d7d] = await Promise.all([
        getLastGps(v),
        includeDistance ? getDistance(v, todayStart, now) : Promise.resolve(null),
        includeDistance ? getDistance(v, sevenDaysAgo, now) : Promise.resolve(null),
      ]);
      return shape(r, gps, dToday?.distance ?? null, d7d?.distance ?? null, false);
    })
  );
  return rows;
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
  const now = Date.now();
  const todayStart = startOfTodayMs();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const [gps, dToday, d7d] = await Promise.all([
    getLastGps(v),
    getDistance(v, todayStart, now),
    getDistance(v, sevenDaysAgo, now),
  ]);
  return shape(r, gps, dToday?.distance ?? null, d7d?.distance ?? null, false);
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
