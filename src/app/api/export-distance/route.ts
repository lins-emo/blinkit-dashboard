import { NextResponse } from "next/server";
import { listBlinkitRiders, getPackInfoForVehicles } from "@/lib/mongo";
import { getDeviceTriples, getReportBatch, getPackEfficiencies, distanceFromReport, type ReportData, type DistanceSource } from "@/lib/sensiot";
import { getIntellicarVehicleSet, getIntellicarDistance } from "@/lib/intellicar";
import { canonicalZone } from "@/config/zones";
import { session } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Vercel default is 10 s; this route does many fan-out fetches (Sensiot batch +
// Intellicar per-day for fallback). Allow up to 60 s on Hobby tier.
export const maxDuration = 60;

interface ExportRow {
  riderId: string;
  name: string;
  phone: string;
  blinkitRiderId: string;
  appId: string;
  city: string;
  zone: string;
  vehicleNo: string;
  batteryId: string;
  packModel: string;
  date: string;          // YYYY-MM-DD (IST)
  distanceKm: number | null;
  energyKwh: number | null;
  source: DistanceSource;
}

// Build a list of YYYY-MM-DD strings from inclusive `from` to inclusive `to`.
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
  const max = 31;
  for (let d = new Date(start), i = 0; d <= end && i < max; d.setUTCDate(d.getUTCDate() + 1), i++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function POST(req: Request) {
  const s = await session();
  if (!s.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Fail loudly if the server-side Sensiot key is missing — otherwise the CSV
  // silently comes back blank and looks broken without explanation.
  if (!process.env.SENSIOT_API_KEY) {
    return NextResponse.json({
      error: "SENSIOT_API_KEY is not set on the server. Add it in Vercel → Settings → Environment Variables and redeploy.",
    }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const from: string = body?.from;
  const to: string = body?.to;
  const onlyRiderIds: string[] | undefined = Array.isArray(body?.riderIds) ? body.riderIds : undefined;
  if (!from || !to) return NextResponse.json({ error: "from and to required (YYYY-MM-DD)" }, { status: 400 });
  const dates = dateRange(from, to);
  if (dates.length === 0) return NextResponse.json({ error: "invalid date range (max 31 days)" }, { status: 400 });

  // 1. Riders + pack info + sensiot triples + intellicar set in parallel
  const allRiders = await listBlinkitRiders();
  const riders = onlyRiderIds ? allRiders.filter((r) => onlyRiderIds.includes(String(r._id))) : allRiders;
  const vehicleIds = riders
    .map((r) => r.vehicleAssigned?.vehicleId?.trim())
    .filter((v): v is string => !!v && !/^Testing/i.test(v));

  const [packs, triples, intellicarVehicles] = await Promise.all([
    getPackInfoForVehicles(vehicleIds),
    getDeviceTriples(),
    getIntellicarVehicleSet(),
  ]);

  // 2. Resolve vehicleId → deviceId.
  // PRIMARY: trust pack.bmsId directly as Sensiot deviceId (reports endpoint accepts
  // any valid BMS serial regardless of recent activity).
  // FALLBACK: when bmsId is empty or obviously bad, look up packId → deviceId via /batteries.
  const byPackId = new Map<string, string>();
  for (const t of triples) {
    if (t.packId) byPackId.set(t.packId, t.deviceId);
  }
  const isValidBms = (v: string | undefined): v is string => {
    if (!v) return false;
    const t = v.trim();
    if (t.length < 5) return false;
    if (/^(BMS ?ID|invalid|none|n\/a|-|0+)$/i.test(t)) return false;
    return true;
  };
  const vehicleToDevice: Record<string, string> = {};
  for (const [vid, pack] of Object.entries(packs)) {
    if (isValidBms(pack.bmsId)) vehicleToDevice[vid] = pack.bmsId;
    else if (pack.batteryId && byPackId.has(pack.batteryId)) vehicleToDevice[vid] = byPackId.get(pack.batteryId)!;
    else if (pack.batterySerial && byPackId.has(pack.batterySerial)) vehicleToDevice[vid] = byPackId.get(pack.batterySerial)!;
  }
  const deviceIds = [...new Set(Object.values(vehicleToDevice))];

  // 3. Bulk Sensiot batch + per-pack efficiencies in parallel.
  const [sensiotBatch, packEfficiencies] = await Promise.all([
    deviceIds.length > 0 ? getReportBatch(deviceIds, dates) : Promise.resolve({} as Record<string, Record<string, ReportData>>),
    deviceIds.length > 0 ? getPackEfficiencies(deviceIds) : Promise.resolve(new Map<string, number>()),
  ]);

  // 4. For vehicles only Intellicar covers, query per-day in parallel — but
  //    bound by a time budget so a stale Intellicar cache can never blow the
  //    function past its maxDuration. Whatever's not back in 20 s is dropped
  //    (those rows fall through to source="none" instead of stalling).
  const intellicarVehiclesNeeded = vehicleIds.filter((vid) => !vehicleToDevice[vid] && intellicarVehicles.has(vid));
  const intellicarResults = new Map<string, Map<string, number>>();
  const intellicarWork = Promise.all(
    intellicarVehiclesNeeded.flatMap((vid) =>
      dates.map(async (date) => {
        const startMs = Date.parse(date + "T00:00:00+05:30");
        const endMs = startMs + 86_400_000 - 1;
        const res = await getIntellicarDistance(vid, startMs, endMs);
        if (res && typeof res.distance === "number" && res.distance > 0) {
          if (!intellicarResults.has(vid)) intellicarResults.set(vid, new Map());
          intellicarResults.get(vid)!.set(date, res.distance);
        }
      })
    )
  );
  const intellicarDeadline = new Promise<void>((r) => setTimeout(r, 20_000));
  await Promise.race([intellicarWork, intellicarDeadline]);

  // 5. Build per-rider per-date rows
  const rows: ExportRow[] = [];
  for (const r of riders) {
    const vid = r.vehicleAssigned?.vehicleId?.trim() ?? "";
    if (!vid || /^Testing/i.test(vid)) continue;
    const pack = packs[vid];
    const deviceId = vehicleToDevice[vid];
    const baseline = {
      riderId: String(r._id),
      name: r.name?.trim() || "—",
      phone: r.phone?.trim() || "",
      blinkitRiderId: r.blinkitRiderId?.trim() || "",
      appId: r.appId?.trim() || r.userName?.trim() || "",
      city: r.city?.trim() || "",
      zone: canonicalZone(r.zone),
      vehicleNo: vid,
      batteryId: pack?.batteryId || pack?.batterySerial || "",
      packModel: pack?.model || "",
    };
    const perPackKmPerKwh = deviceId ? packEfficiencies.get(deviceId) : undefined;

    for (const date of dates) {
      const rep = deviceId ? sensiotBatch[deviceId]?.[date] : undefined;
      let energyKwh: number | null = rep && typeof rep.energyConsumed === "number" && rep.energyConsumed > 0
        ? Math.round(rep.energyConsumed * 1000) / 1000
        : null;

      const sensiotResult = distanceFromReport(rep, perPackKmPerKwh);
      let distanceKm = sensiotResult.km;
      let source: DistanceSource = sensiotResult.source;

      // Intellicar fallback only when Sensiot returned no data at all
      if (distanceKm == null) {
        const icDay = intellicarResults.get(vid)?.get(date);
        if (icDay != null && icDay > 0) {
          distanceKm = Math.round(icDay * 10) / 10;
          source = "intellicar";
        }
      }

      rows.push({ ...baseline, date, distanceKm, energyKwh, source });
    }
  }

  return NextResponse.json({
    meta: {
      dates,
      ridersExported: riders.length,
      rows: rows.length,
      sources: {
        sensiotGps: rows.filter((r) => r.source === "sensiot-gps").length,
        sensiotGpsSuspicious: rows.filter((r) => r.source === "sensiot-gps-suspicious").length,
        sensiotEnergyPack: rows.filter((r) => r.source === "sensiot-energy-pack").length,
        sensiotEnergyFleet: rows.filter((r) => r.source === "sensiot-energy-fleet").length,
        intellicar: rows.filter((r) => r.source === "intellicar").length,
        none: rows.filter((r) => r.source === "none").length,
      },
    },
    rows,
  });
}
