"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { RiderRow } from "@/lib/data";
import { ridersToCsv, downloadCsv } from "@/lib/csv";
import { LiveStatusPill, VehicleStatusPill } from "./StatusPill";
import Avatar from "./Avatar";
import DownloadButton from "./DownloadButton";
import RelativeTime from "./RelativeTime";

type SortKey = "name" | "zone" | "distanceTodayKm" | "distance7dKm" | "liveSpeed" | "liveBattery" | "liveCommTime";
type SortDir = "asc" | "desc";

function fmt(n: number | null | undefined, d = 1, suffix = "") {
  if (n == null) return "—";
  return n.toFixed(d) + suffix;
}

function batteryClass(v: number | null) {
  if (v == null) return "text-ink-3";
  if (v < 20) return "text-bad font-semibold";
  if (v < 40) return "text-warn font-medium";
  return "text-ink";
}

function SortHeader({ label, k, sortKey, sortDir, onSort, align = "left" }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th className={`px-3 py-2.5 font-medium text-${align} select-none`}>
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-ink transition ${active ? "text-ink" : "text-ink-3"}`}
      >
        {label}
        <span className={`text-[8px] transition ${active ? "opacity-100" : "opacity-30"}`}>
          {active && sortDir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export default function RidersTable({ rows, downloadName = "blinkit-riders" }: { rows: RiderRow[]; downloadName?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("distance7dKm");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "zone" ? "asc" : "desc"); }
  }

  const filtered = useMemo(() => {
    const filt = rows.filter((r) => {
      if (status !== "all" && r.liveStatus !== status) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.phone} ${r.vehicleNo ?? ""} ${r.zone} ${r.city}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    const sorted = [...filt].sort((a, b) => {
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return sorted;
  }, [rows, q, status, sortKey, sortDir]);


  return (
    <div className="rounded-card border border-line bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, vehicle, zone…"
            className="w-full text-sm pl-9 pr-3 py-1.5 border border-line-2 rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-sm px-3 py-1.5 border border-line-2 rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
        >
          <option value="all">All statuses</option>
          <option value="on-trip">On trip</option>
          <option value="idle">Idle</option>
          <option value="parked">Parked</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
        <DownloadButton
          riderIds={filtered.map((r) => r.id)}
          fileNamePrefix={downloadName}
          fallbackSnapshot={() => {
            const stamp = new Date().toISOString().slice(0, 10);
            downloadCsv(`${downloadName}-${stamp}-snapshot.csv`, ridersToCsv(filtered));
          }}
        />
        <span className="text-xs text-ink-3 ml-auto tabular-nums">{filtered.length} of {rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg/60 text-[11px] uppercase tracking-wider sticky top-0 z-10">
            <tr className="border-b border-line">
              <SortHeader label="Rider" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-3 py-2.5 font-medium text-ink-3">Blinkit ID</th>
              <th className="text-left px-3 py-2.5 font-medium text-ink-3">Vehicle</th>
              <th className="text-left px-3 py-2.5 font-medium text-ink-3">Battery</th>
              <SortHeader label="Zone" k="zone" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Today" k="distanceTodayKm" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="7 days" k="distance7dKm" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="Speed" k="liveSpeed" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="SOC" k="liveBattery" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <th className="text-left px-3 py-2.5 font-medium text-ink-3">Live</th>
              <th className="text-left px-3 py-2.5 font-medium text-ink-3">Vehicle</th>
              <SortHeader label="Last seen" k="liveCommTime" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-bg/70 transition group">
                <td className="px-4 py-2.5">
                  <Link href={`/riders/${r.id}`} className="flex items-center gap-2.5">
                    <Avatar name={r.name} src={r.kycSelfieUrl} size={28} />
                    <div className="min-w-0">
                      <div className="font-medium text-ink group-hover:underline truncate">{r.name}</div>
                      <div className="text-xs text-ink-3 truncate">{r.phone || "—"}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-2 whitespace-nowrap">{r.blinkitRiderId || r.appId || "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="font-mono text-xs text-ink-2">{r.vehicleNo ?? "—"}</div>
                  {r.packModel && <div className="text-[11px] text-ink-3">{r.packModel}</div>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-2">{r.batteryId || "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="text-ink-2">{r.zone}</div>
                  <div className="text-xs text-ink-3">{r.city}</div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmt(r.distanceTodayKm, 1, " km")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmt(r.distance7dKm, 1, " km")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{fmt(r.liveSpeed, 0, " km/h")}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${batteryClass(r.liveBattery)}`}>
                  {r.liveBattery == null ? "—" : `${r.liveBattery.toFixed(0)}%`}
                </td>
                <td className="px-3 py-2.5"><LiveStatusPill status={r.liveStatus} /></td>
                <td className="px-3 py-2.5"><VehicleStatusPill status={r.vehicleStatusFlag} /></td>
                <td className="px-4 py-2.5 text-right text-xs text-ink-3 tabular-nums"><RelativeTime t={r.liveCommTime} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-12 text-center text-ink-3 text-sm">
                <div className="font-medium">No riders match.</div>
                <div className="text-xs mt-1">Try clearing the filter or search.</div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
