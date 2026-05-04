import Link from "next/link";
import Shell from "@/components/Shell";
import KpiCard from "@/components/KpiCard";
import Avatar from "@/components/Avatar";
import Sparkline from "@/components/Sparkline";
import { LiveStatusPill, VehicleStatusPill, NotProvisionedPill } from "@/components/StatusPill";
import { getRiderRowById, getRiderDoc, getDailyDistanceSeries } from "@/lib/data";
import { getGpsHistory } from "@/lib/intellicar";
import { summarize } from "@/lib/behavior";

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

  const v = doc.vehicleAssigned?.vehicleId?.trim();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const canTrack = !!v && !/^Testing/i.test(v) && !row.notOnIntellicar;
  const [points, daily] = await Promise.all([
    canTrack ? getGpsHistory(v!, dayAgo, now) : Promise.resolve([]),
    canTrack ? getDailyDistanceSeries(v!, 7) : Promise.resolve([]),
  ]);
  const summary = summarize(points);

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
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {row.notOnIntellicar ? <NotProvisionedPill /> : <LiveStatusPill status={row.liveStatus} />}
            <VehicleStatusPill status={row.vehicleStatusFlag} />
            {row.freezeStatus && <span className="text-[11px] px-2 py-0.5 rounded-full bg-bad/10 text-bad border border-bad/25 font-medium">Frozen</span>}
            {row.bmsUnresponsive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-warn/10 text-warn border border-warn/25 font-medium">BMS unresponsive</span>}
            {row.vehicleNo && <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-bg border border-line text-ink-2">{row.vehicleNo}</span>}
          </div>
        </div>
      </div>

      {row.notOnIntellicar && (
        <div className="mb-5 rounded-card border border-warn/30 bg-warn/5 p-3.5 flex items-start gap-3 text-sm">
          <svg className="text-warn shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div>
            <div className="font-medium text-ink">This vehicle is not on Intellicar yet</div>
            <div className="text-ink-2 mt-0.5 text-xs">No live data, distance, or trip history available until the IoT tracker is provisioned for <code className="font-mono">{row.vehicleNo}</code>.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiCard label="Today" value={`${(row.distanceTodayKm ?? 0).toFixed(1)} km`} tone="accent" />
        <KpiCard label="Last 7 days" value={`${(row.distance7dKm ?? 0).toFixed(0)} km`} />
        <KpiCard label="Speed now" value={row.liveSpeed != null ? `${row.liveSpeed.toFixed(0)} km/h` : "—"} />
        <KpiCard label="Battery" value={row.liveBattery != null ? `${row.liveBattery.toFixed(0)}%` : "—"}
          tone={row.liveBattery != null && row.liveBattery < 20 ? "bad" : row.liveBattery != null && row.liveBattery < 40 ? "warn" : "default"} />
        <KpiCard label="Odometer" value={row.odometer != null ? `${row.odometer.toFixed(0)} km` : "—"}
          sub={`Last seen ${fmtTime(row.liveCommTime)}`} />
      </div>

      {daily.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-ink">Distance · last 7 days</div>
            <div className="text-xs text-ink-3 tabular-nums">total {daily.reduce((s, d) => s + d.km, 0).toFixed(1)} km</div>
          </div>
          <Sparkline data={daily} height={90} />
        </div>
      )}

      <div className="rounded-card border border-line bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="text-sm font-medium text-ink">Behavior · last 24 hours</div>
          <div className="text-xs text-ink-3 tabular-nums">{summary.tripCount} trips · {summary.totalDistanceKm.toFixed(1)} km</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-line border-t border-line">
          <Stat label="Distance" value={`${summary.totalDistanceKm.toFixed(1)} km`} />
          <Stat label="Trips" value={String(summary.tripCount)} />
          <Stat label="Active time" value={`${summary.activeMin.toFixed(0)} min`} />
          <Stat label="Moving time" value={`${summary.movingMin.toFixed(0)} min`} />
          <Stat label="Idle time" value={`${summary.idleMin.toFixed(0)} min`} warn={summary.idleMin > summary.movingMin && summary.movingMin > 0} />
          <Stat label="Max speed" value={`${summary.maxSpeed.toFixed(0)} km/h`} warn={summary.maxSpeed > 60} />
          <Stat label="Avg moving" value={`${summary.avgMovingSpeed.toFixed(0)} km/h`} />
          <Stat label="Min battery" value={summary.minBattery != null ? `${summary.minBattery.toFixed(0)}%` : "—"} warn={summary.minBattery != null && summary.minBattery < 20} />
          <Stat label="Harsh accel" value={String(summary.harshAccelCount)} warn={summary.harshAccelCount > 5} bad={summary.harshAccelCount > 15} />
          <Stat label="Harsh brake" value={String(summary.harshBrakeCount)} warn={summary.harshBrakeCount > 5} bad={summary.harshBrakeCount > 15} />
          <Stat label="Battery dips" value={String(summary.batteryDipCount)} warn={summary.batteryDipCount > 0} />
          <Stat label="GPS points" value={String(points.length)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">

        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Trips · 24h</div>
            <div className="text-xs text-ink-3">{summary.trips.length} {summary.trips.length === 1 ? "trip" : "trips"}</div>
          </div>
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg/60 text-[11px] uppercase tracking-wider text-ink-3 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Started</th>
                  <th className="text-right px-3 py-2 font-medium">Distance</th>
                  <th className="text-right px-3 py-2 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 font-medium">Idle</th>
                  <th className="text-right px-4 py-2 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {summary.trips.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-ink-3">
                  <div>{row.notOnIntellicar ? "Tracker not provisioned." : "No trips in the last 24 hours."}</div>
                </td></tr>}
                {summary.trips.slice().reverse().map((t, i) => (
                  <tr key={i} className="border-t border-line hover:bg-bg/60 transition">
                    <td className="px-4 py-2 text-ink-2">{new Date(t.startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{t.distanceKm.toFixed(1)} km</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">{t.durationMin.toFixed(0)} min</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-3">{t.idleMin.toFixed(0)} min</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-2">{t.maxSpeed.toFixed(0)} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {(doc.kyc?.aadharUrl || doc.kyc?.licenseUrl || doc.kyc?.pancardUrl || doc.kyc?.selfieUrl) && (
        <div className="mt-5 rounded-card border border-line bg-surface overflow-hidden">
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

function Row({ label, value, warn, bad }: { label: string; value: string; warn?: boolean; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-line last:border-0">
      <dt className="text-ink-2 text-[13px]">{label}</dt>
      <dd className={`tabular-nums font-medium ${bad ? "text-bad" : warn ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value, warn, bad }: { label: string; value: string; warn?: boolean; bad?: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${bad ? "text-bad" : warn ? "text-warn" : "text-ink"}`}>{value}</div>
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
