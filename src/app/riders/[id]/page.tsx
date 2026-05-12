import Link from "next/link";
import Shell from "@/components/Shell";
import KpiCard from "@/components/KpiCard";
import Avatar from "@/components/Avatar";
import Sparkline from "@/components/Sparkline";
import LivePack from "@/components/LivePack";
import { LiveStatusPill, VehicleStatusPill } from "@/components/StatusPill";
import { getRiderRowById, getRiderDoc, getDailyDistanceSeries } from "@/lib/data";
import { getPackInfoForVehicles, type PackInfo } from "@/lib/mongo";

export const dynamic = "force-dynamic";

function fmtTime(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default async function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row, doc] = await Promise.all([getRiderRowById(id), getRiderDoc(id)]);
  if (!row || !doc) {
    return (
      <Shell>
        <div className="rounded-card border border-line bg-surface p-12 text-center">
          <div className="text-ink font-semibold">Rider not found</div>
          <div className="text-ink-3 text-sm mt-1">The rider may have been removed or the link is incorrect.</div>
          <Link href="/riders" className="inline-block mt-4 text-sm text-accent-ink bg-accent px-3 py-1.5 rounded-md hover:brightness-95">← Back to riders</Link>
        </div>
      </Shell>
    );
  }

  const vehicleNo = doc.vehicleAssigned?.vehicleId?.trim();
  const [daily, packMap] = await Promise.all([
    vehicleNo && !/^Testing/i.test(vehicleNo) ? getDailyDistanceSeries(vehicleNo, 7) : Promise.resolve([]),
    vehicleNo ? getPackInfoForVehicles([vehicleNo]) : Promise.resolve({} as Record<string, PackInfo>),
  ]);
  const pack: PackInfo | null = vehicleNo ? (packMap[vehicleNo] ?? null) : null;
  const dailyTotal = daily.reduce((s, d) => s + d.km, 0);

  return (
    <Shell>
      <Link href="/riders" className="text-xs text-ink-3 hover:text-ink inline-flex items-center gap-1">← All riders</Link>

      <div className="mt-3 mb-6 flex items-start gap-4 flex-wrap">
        <Avatar name={row.name} src={row.kycSelfieUrl} size={64} />
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-2xl font-semibold text-ink tracking-tight">{row.name}</h1>
          <div className="text-sm text-ink-3 mt-0.5 flex items-center gap-1.5 flex-wrap">
            {row.phone && <span>{row.phone}</span>}
            {row.phone && <span>·</span>}
            <span>{row.city}</span>
            <span>·</span>
            <span>{row.zone}</span>
            {row.landmark && (<><span>·</span><span>{row.landmark}</span></>)}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap">
            {row.blinkitRiderId && (
              <span className="text-ink-3">
                <span className="uppercase tracking-wider">Blinkit ID</span>{" "}
                <span className="font-mono text-ink-2 font-medium">{row.blinkitRiderId}</span>
              </span>
            )}
            {row.appId && (
              <span className="text-ink-3">
                <span className="uppercase tracking-wider">App ID</span>{" "}
                <span className="font-mono text-ink-2 font-medium">{row.appId}</span>
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <LiveStatusPill status={row.liveStatus} />
            <VehicleStatusPill status={row.vehicleStatusFlag} />
            {row.freezeStatus && <span className="text-[11px] px-2 py-0.5 rounded-full bg-bad/10 text-bad border border-bad/25 font-medium">Frozen</span>}
            {row.bmsUnresponsive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/25 font-medium">BMS unresponsive</span>}
            {row.vehicleNo && <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-bg border border-line text-ink-2">{row.vehicleNo}</span>}
          </div>
        </div>
      </div>

      {row.batteryId && (
        <LivePack
          packId={row.batteryId}
          initial={{
            soc: row.liveBattery,
            speed: row.liveSpeed,
            voltage: row.packVoltage,
            current: row.packCurrent,
            cycleCount: row.cycleCount,
            lastSeen: row.liveCommTime,
          }}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Today" value={`${(row.distanceTodayKm ?? 0).toFixed(1)} km`} tone="accent" />
        <KpiCard label="Last 7 days" value={`${(row.distance7dKm ?? 0).toFixed(0)} km`} />
        <KpiCard label="Speed now" value={row.liveSpeed != null ? `${row.liveSpeed.toFixed(0)} km/h` : "—"} />
        <KpiCard label="Battery" value={row.liveBattery != null ? `${row.liveBattery.toFixed(0)}%` : "—"}
          tone={row.liveBattery != null && row.liveBattery < 20 ? "bad" : row.liveBattery != null && row.liveBattery < 40 ? "warn" : "default"} />
        <KpiCard label="Cycles" value={row.cycleCount != null ? row.cycleCount.toFixed(1) : "—"}
          sub={`Last seen ${fmtTime(row.liveCommTime)}`} />
      </div>

      {daily.length > 0 && dailyTotal > 0 && (
        <div className="rounded-card border border-line bg-surface p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-ink">Distance · last 7 days</div>
            <div className="text-xs text-ink-3 tabular-nums">total {dailyTotal.toFixed(1)} km</div>
          </div>
          <Sparkline data={daily} height={90} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Pack</div>
            {row.packStatus && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${row.packStatus === "Active" ? "bg-good/8 text-good border-good/25" : "bg-line text-ink-3 border-line-2"}`}>
                {row.packStatus}
              </span>
            )}
          </div>
          <dl className="text-sm">
            <Row label="Battery ID"        value={row.batteryId || "—"} mono />
            <Row label="BMS ID"            value={row.bmsId || "—"}     mono />
            <Row label="Model"             value={row.packModel || "—"} />
            <Row label="Vendor"            value={row.packVendor || "—"} />
            <Row label="Pack voltage"      value={row.packVoltage != null ? `${row.packVoltage.toFixed(1)} V` : "—"} />
            <Row label="Pack current"      value={row.packCurrent != null ? `${row.packCurrent.toFixed(1)} A` : "—"} />
            <Row label="Remaining"         value={row.packRemainingCapacity != null ? `${row.packRemainingCapacity.toFixed(1)} Ah` : "—"} />
            <Row label="Energy today"      value={row.energyTodayKwh != null ? `${row.energyTodayKwh.toFixed(2)} kWh` : "—"} />
            <Row label="Cell spread"       value={row.cellSpreadMv != null ? `${row.cellSpreadMv} mV` : "—"}
              warn={row.cellSpreadMv != null && row.cellSpreadMv > 100}
              bad={row.cellSpreadMv != null && row.cellSpreadMv > 200} />
            <Row label="Pack temperature"  value={row.maxTempC != null ? `${row.minTempC?.toFixed(0)}–${row.maxTempC.toFixed(0)} °C` : "—"}
              warn={row.maxTempC != null && row.maxTempC > 50}
              bad={row.maxTempC != null && row.maxTempC > 60} />
            <Row label="Active faults"     value={String(row.faultsActive)}
              warn={row.faultsActive > 0} />
          </dl>
        </div>

        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Payments</div>
            {row.avgRentDelayDays != null && (
              <div className="text-xs">
                <span className="text-ink-3">avg delay </span>
                <span className={`tabular-nums font-medium ${row.avgRentDelayDays > 5 ? "text-bad" : row.avgRentDelayDays > 2 ? "text-warn" : "text-good"}`}>
                  {row.avgRentDelayDays.toFixed(1)}d
                </span>
              </div>
            )}
          </div>
          <dl className="text-sm">
            <Row label="Plan" value={String(doc.plan_selected?.plan ?? "—")} />
            <Row label="Weekly amount" value={doc.plan_selected?.amount ? `₹${doc.plan_selected.amount}` : "—"} />
            <Row label="Deposit paid" value={row.totalRentDeposited != null ? `₹${row.totalRentDeposited.toLocaleString("en-IN")}` : "—"} />
            <Row label="Next rent due" value={fmtDate(row.rentDueDate)} />
          </dl>
          <div className="px-4 pt-3 pb-4 border-t border-line">
            <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-2 font-medium">Recent payments</div>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {(doc.topUp ?? []).slice().reverse().slice(0, 8).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <div className="text-ink-2">{fmtDate(t.topUpAmountDate)}</div>
                    <div className="text-ink-3 text-[10px]">{t.source ?? "—"}</div>
                  </div>
                  <span className="font-semibold tabular-nums text-ink">₹{t.topUpAmount.toLocaleString("en-IN")}</span>
                </div>
              ))}
              {(doc.topUp ?? []).length === 0 && <div className="text-xs text-ink-3">No payments yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {pack && pack.replacementHistory.length > 0 && (
        <div className="rounded-card border border-line bg-surface overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Pack swap history</div>
            <div className="text-xs text-ink-3">{pack.replacementHistory.length} swap{pack.replacementHistory.length === 1 ? "" : "s"}</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-bg/60 text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Battery</th>
                <th className="text-left px-3 py-2 font-medium">Replaced at</th>
              </tr>
            </thead>
            <tbody>
              {pack.replacementHistory.map((s, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs text-ink-2">{s.batteryId || "—"}</td>
                  <td className="px-3 py-2 text-ink-3">{s.replacedAt || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(doc.kyc?.aadharUrl || doc.kyc?.licenseUrl || doc.kyc?.pancardUrl || doc.kyc?.selfieUrl) && (
        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><div className="text-sm font-medium text-ink">KYC documents</div></div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {doc.kyc?.selfieUrl && <KycLink label="Selfie" url={doc.kyc.selfieUrl} />}
            {doc.kyc?.aadharUrl && <KycLink label="Aadhaar" url={doc.kyc.aadharUrl} />}
            {doc.kyc?.licenseUrl && <KycLink label="License" url={doc.kyc.licenseUrl} />}
            {doc.kyc?.pancardUrl && <KycLink label="PAN" url={doc.kyc.pancardUrl} />}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Row({ label, value, warn, bad, mono }: { label: string; value: string; warn?: boolean; bad?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-line last:border-0">
      <dt className="text-ink-2 text-[13px]">{label}</dt>
      <dd className={`tabular-nums font-medium ${mono ? "font-mono text-xs" : ""} ${bad ? "text-bad" : warn ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function KycLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group block text-sm border border-line rounded-md px-3 py-2 hover:bg-bg hover:border-line-2 transition">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className="text-ink-2 text-xs flex items-center gap-1 mt-0.5">
        View
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
      </div>
    </a>
  );
}
