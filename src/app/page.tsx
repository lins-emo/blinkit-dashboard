import Link from "next/link";
import Shell from "@/components/Shell";
import KpiCard from "@/components/KpiCard";
import Avatar from "@/components/Avatar";
import { LiveStatusPill, NotProvisionedPill } from "@/components/StatusPill";
import LastUpdated from "@/components/LastUpdated";
import { getAllRiderRows } from "@/lib/data";

// Auth-gated, must render per request. Speed comes from the Vercel Data Cache
// layer inside lib/intellicar (unstable_cache) and the loading.tsx skeleton.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const rows = await getAllRiderRows();

  const total = rows.length;
  const trackerPending = rows.filter((r) => r.notOnIntellicar).length;
  const trackedTotal = total - trackerPending;
  const onTrip = rows.filter((r) => r.liveStatus === "on-trip").length;
  const idle = rows.filter((r) => r.liveStatus === "idle").length;
  const parked = rows.filter((r) => r.liveStatus === "parked").length;
  const offline = rows.filter((r) => r.liveStatus === "offline").length;
  const distToday = rows.reduce((s, r) => s + (r.distanceTodayKm ?? 0), 0);
  const dist7d = rows.reduce((s, r) => s + (r.distance7dKm ?? 0), 0);
  const lowBat = rows.filter((r) => r.liveBattery != null && r.liveBattery < 20).length;
  const immobilized = rows.filter((r) => r.vehicleStatusFlag === "IMMOBILIZED").length;

  const byZone = new Map<string, { count: number; distToday: number; dist7d: number; onTrip: number; trackerPending: number }>();
  for (const r of rows) {
    const z = byZone.get(r.zone) ?? { count: 0, distToday: 0, dist7d: 0, onTrip: 0, trackerPending: 0 };
    z.count += 1;
    z.distToday += r.distanceTodayKm ?? 0;
    z.dist7d += r.distance7dKm ?? 0;
    if (r.liveStatus === "on-trip") z.onTrip += 1;
    if (r.notOnIntellicar) z.trackerPending += 1;
    byZone.set(r.zone, z);
  }
  const zones = [...byZone.entries()].sort((a, b) => b[1].count - a[1].count);
  const maxZoneDist = Math.max(1, ...zones.map(([, z]) => z.dist7d));

  const renderedAt = Date.now();

  return (
    <Shell>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Fleet overview</h1>
          <p className="text-sm text-ink-3 mt-0.5">Live status across all Blinkit riders.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          <span className="tabular-nums">
            {trackedTotal}/{total} tracked
            {trackerPending > 0 && <span className="ml-2 text-warn">· {trackerPending} pending</span>}
          </span>
          <span className="h-3 w-px bg-line-2" />
          <LastUpdated at={renderedAt} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Riders" value={total}
          sub={immobilized > 0 ? <span><span className="text-bad font-medium">{immobilized}</span> immobilized</span> : "All mobilized"} />
        <KpiCard label="On trip now" value={onTrip}
          sub={`${idle} idle · ${parked} parked · ${offline} offline`}
          tone={onTrip > 0 ? "good" : "default"} />
        <KpiCard label="Distance today" value={`${distToday.toFixed(1)} km`}
          sub={`avg ${total ? (distToday / total).toFixed(1) : "0"} km / rider`}
          tone="accent" />
        <KpiCard label="Distance · 7d" value={`${dist7d.toFixed(0)} km`}
          sub={lowBat > 0 ? <span><span className="text-bad font-medium">{lowBat}</span> low battery (&lt;20%)</span> : "All batteries OK"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Top movers · 7 days</div>
            <Link href="/riders" className="text-xs text-ink-3 hover:text-ink">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[...rows]
                .filter((r) => (r.distance7dKm ?? 0) > 0)
                .sort((a, b) => (b.distance7dKm ?? 0) - (a.distance7dKm ?? 0))
                .slice(0, 8)
                .map((r) => (
                  <tr key={r.id} className="border-t border-line first:border-0 hover:bg-bg/70 transition">
                    <td className="px-4 py-2.5">
                      <Link href={`/riders/${r.id}`} className="flex items-center gap-2.5">
                        <Avatar name={r.name} src={r.kycSelfieUrl} size={28} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink truncate">{r.name}</div>
                          <div className="text-xs text-ink-3 truncate">{r.zone}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5"><LiveStatusPill status={r.liveStatus} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold tabular-nums text-ink">{(r.distance7dKm ?? 0).toFixed(1)} km</div>
                      <div className="text-[11px] text-ink-3 tabular-nums">{(r.distanceTodayKm ?? 0).toFixed(1)} km today</div>
                    </td>
                  </tr>
                ))}
              {rows.filter((r) => (r.distance7dKm ?? 0) > 0).length === 0 && (
                <tr><td className="px-4 py-12 text-center text-ink-3 text-sm">No rides recorded in the last 7 days.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-card border border-line bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Needs attention</div>
            <span className="text-xs text-ink-3 tabular-nums">
              {rows.filter((r) => r.notOnIntellicar || r.vehicleStatusFlag === "IMMOBILIZED" || (r.liveBattery != null && r.liveBattery < 20) || r.bmsUnresponsive || r.freezeStatus).length}
            </span>
          </div>
          <div className="divide-y divide-line max-h-[420px] overflow-y-auto">
            {rows
              .map((r) => {
                const issues: { kind: "bad" | "warn"; label: string }[] = [];
                if (r.vehicleStatusFlag === "IMMOBILIZED") issues.push({ kind: "bad", label: "Immobilized" });
                if (r.freezeStatus) issues.push({ kind: "bad", label: "Frozen" });
                if (r.bmsUnresponsive) issues.push({ kind: "warn", label: "BMS unresponsive" });
                if (r.liveBattery != null && r.liveBattery < 20) issues.push({ kind: "bad", label: `Battery ${r.liveBattery.toFixed(0)}%` });
                if (r.notOnIntellicar) issues.push({ kind: "warn", label: "Tracker pending" });
                if (r.avgRentDelayDays != null && r.avgRentDelayDays > 5) issues.push({ kind: "warn", label: `Rent delay ${r.avgRentDelayDays.toFixed(1)}d avg` });
                return { r, issues };
              })
              .filter((x) => x.issues.length > 0)
              .sort((a, b) => b.issues.filter(i => i.kind === "bad").length - a.issues.filter(i => i.kind === "bad").length)
              .slice(0, 12)
              .map(({ r, issues }) => (
                <Link key={r.id} href={`/riders/${r.id}`} className="block px-4 py-2.5 hover:bg-bg/70 transition">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} src={r.kycSelfieUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink text-sm truncate">{r.name}</div>
                      <div className="text-xs text-ink-3 truncate">{r.zone} · {r.vehicleNo ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {issues.slice(0, 2).map((i, idx) => (
                        <span key={idx} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${i.kind === "bad" ? "bg-bad/8 text-bad border-bad/20" : "bg-warn/8 text-warn border-warn/25"}`}>
                          {i.label}
                        </span>
                      ))}
                      {issues.length > 2 && <span className="text-[10px] text-ink-3">+{issues.length - 2}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            {rows.every((r) => !r.notOnIntellicar && r.vehicleStatusFlag !== "IMMOBILIZED" && !(r.liveBattery != null && r.liveBattery < 20) && !r.bmsUnresponsive && !r.freezeStatus) && (
              <div className="px-4 py-12 text-center text-ink-3 text-sm">All clear — no issues.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="text-sm font-medium text-ink">By zone</div>
          <div className="text-xs text-ink-3 tabular-nums">{zones.length} zones</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg/60 text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Zone</th>
                <th className="text-right px-3 py-2.5 font-medium">Riders</th>
                <th className="text-right px-3 py-2.5 font-medium">On trip</th>
                <th className="text-right px-3 py-2.5 font-medium">Today</th>
                <th className="text-left px-3 py-2.5 font-medium">7-day distance</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(([zone, z]) => (
                <tr key={zone} className="border-t border-line hover:bg-bg/70 transition">
                  <td className="px-4 py-2.5">
                    <Link href={`/zones/${encodeURIComponent(zone)}`} className="font-medium text-ink hover:underline">{zone}</Link>
                    {z.trackerPending > 0 && <span className="ml-2 text-[10px] uppercase tracking-wider text-warn">{z.trackerPending} pending</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{z.count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {z.onTrip > 0 ? <span className="text-good font-medium">{z.onTrip}</span> : <span className="text-ink-3">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{z.distToday.toFixed(1)} km</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[160px] h-1.5 bg-bg rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.max(2, (z.dist7d / maxZoneDist) * 100)}%` }} />
                      </div>
                      <span className="tabular-nums text-ink-2 text-xs w-16 text-right">{z.dist7d.toFixed(0)} km</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </Shell>
  );
}
