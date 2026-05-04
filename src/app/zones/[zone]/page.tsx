import Link from "next/link";
import Shell from "@/components/Shell";
import RidersTable from "@/components/RidersTable";
import KpiCard from "@/components/KpiCard";
import { getAllRiderRows } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ZonePage({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  const decoded = decodeURIComponent(zone);
  const all = await getAllRiderRows();
  const rows = all.filter((r) => r.zone === decoded);

  const onTrip = rows.filter((r) => r.liveStatus === "on-trip").length;
  const distToday = rows.reduce((s, r) => s + (r.distanceTodayKm ?? 0), 0);
  const dist7d = rows.reduce((s, r) => s + (r.distance7dKm ?? 0), 0);

  return (
    <Shell>
      <Link href="/" className="text-xs text-ink-3 hover:text-ink">← Back to overview</Link>
      <div className="mt-2 mb-5">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">{decoded}</h1>
        <p className="text-sm text-ink-3 mt-0.5">{rows.length} riders in this zone.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Riders" value={rows.length} />
        <KpiCard label="On trip" value={onTrip} tone={onTrip > 0 ? "good" : "default"} />
        <KpiCard label="Today" value={`${distToday.toFixed(1)} km`} />
        <KpiCard label="7 days" value={`${dist7d.toFixed(0)} km`} />
      </div>
      <RidersTable rows={rows} />
    </Shell>
  );
}
