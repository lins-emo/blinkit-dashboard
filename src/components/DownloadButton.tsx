"use client";
import { useEffect, useRef, useState } from "react";
import { downloadCsv } from "@/lib/csv";

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
  date: string;
  distanceKm: number | null;
  energyKwh: number | null;
}

function todayIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000 - n * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

function escapeCsv(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type ExportMode = "individual" | "merged" | "total";

// One row per (rider × date) — passthrough of the API response.
function individualCsv(rows: ExportRow[]): string {
  const cols: { header: string; get: (r: ExportRow) => string | number | null }[] = [
    { header: "Date",            get: (r) => r.date },
    { header: "Name",            get: (r) => r.name },
    { header: "Phone",           get: (r) => r.phone },
    { header: "Blinkit Rider ID",get: (r) => r.blinkitRiderId },
    { header: "City",            get: (r) => r.city },
    { header: "Zone",            get: (r) => r.zone },
    { header: "Vehicle No.",     get: (r) => r.vehicleNo },
    { header: "Battery ID",      get: (r) => r.batteryId },
    { header: "Model",           get: (r) => r.packModel },
    { header: "Distance (km)",   get: (r) => r.distanceKm != null ? r.distanceKm.toFixed(1) : "" },
  ];
  const header = cols.map((c) => c.header).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsv(c.get(r))).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

// One row per rider — distance summed across the requested date range.
function mergedCsv(rows: ExportRow[], from: string, to: string): string {
  interface Agg {
    name: string; phone: string; blinkitRiderId: string;
    city: string; zone: string; vehicleNo: string;
    batteryId: string; packModel: string;
    totalKm: number; daysWithData: number;
  }
  const byRider = new Map<string, Agg>();
  for (const r of rows) {
    if (!byRider.has(r.riderId)) {
      byRider.set(r.riderId, {
        name: r.name, phone: r.phone, blinkitRiderId: r.blinkitRiderId,
        city: r.city, zone: r.zone, vehicleNo: r.vehicleNo,
        batteryId: r.batteryId, packModel: r.packModel,
        totalKm: 0, daysWithData: 0,
      });
    }
    const a = byRider.get(r.riderId)!;
    if (r.distanceKm != null) {
      a.totalKm += r.distanceKm;
      a.daysWithData += 1;
    }
  }
  const cols = [
    "Name", "Phone", "Blinkit Rider ID", "City", "Zone",
    "Vehicle No.", "Battery ID", "Model",
    "From", "To", "Days With Data", "Total Distance (km)",
  ];
  const header = cols.join(",");
  // Sort descending by total km so the busiest riders are on top.
  const sorted = [...byRider.values()].sort((a, b) => b.totalKm - a.totalKm);
  const body = sorted.map((a) => [
    a.name, a.phone, a.blinkitRiderId, a.city, a.zone,
    a.vehicleNo, a.batteryId, a.packModel,
    from, to, a.daysWithData, a.totalKm.toFixed(1),
  ].map(escapeCsv).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

// Single grand-total row — fleet-level summary.
function totalCsv(rows: ExportRow[], from: string, to: string): string {
  const riderIds = new Set<string>();
  let totalKm = 0;
  let pairsWithData = 0;
  for (const r of rows) {
    riderIds.add(r.riderId);
    if (r.distanceKm != null) {
      totalKm += r.distanceKm;
      pairsWithData += 1;
    }
  }
  const header = "From,To,Riders,Total Pack-Days,Pack-Days With Data,Total Distance (km),Avg km / Rider";
  const avgPerRider = riderIds.size > 0 ? totalKm / riderIds.size : 0;
  const body = [
    from, to, riderIds.size, rows.length, pairsWithData, totalKm.toFixed(1), avgPerRider.toFixed(1),
  ].map(escapeCsv).join(",");
  return header + "\n" + body + "\n";
}

function buildCsv(rows: ExportRow[], mode: ExportMode, from: string, to: string): string {
  if (mode === "merged") return mergedCsv(rows, from, to);
  if (mode === "total")  return totalCsv(rows, from, to);
  return individualCsv(rows);
}

export default function DownloadButton({
  riderIds,
  fileNamePrefix = "blinkit-riders",
  fallbackSnapshot,
  fallbackToCsv,
}: {
  riderIds: string[];
  fileNamePrefix?: string;
  /** A click that downloads a snapshot of the currently filtered rows (no date range). */
  fallbackSnapshot?: () => void;
  fallbackToCsv?: (filename: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(daysAgoIso(6));
  const [to, setTo] = useState(todayIso());
  const [mode, setMode] = useState<ExportMode>("individual");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function download() {
    setLoading(true);
    setErr(null);
    setWarning(null);
    try {
      const res = await fetch("/api/export-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, riderIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        rows: ExportRow[];
        meta: {
          sources: Record<string, number>;
          backendErrors?: { count: number; firstMessage: string | null };
        };
      };
      const csv = buildCsv(data.rows, mode, from, to);
      const stamp = from === to ? from : `${from}_to_${to}`;
      const suffix = mode === "individual" ? "" : `-${mode}`;
      downloadCsv(`${fileNamePrefix}-${stamp}${suffix}.csv`, csv);
      // Surface backend-error count if present so ops sees data quality at a glance.
      const be = data.meta?.backendErrors;
      if (be && be.count > 0) {
        const reason = be.firstMessage ? ` — ${be.firstMessage.slice(0, 80)}${be.firstMessage.length > 80 ? "…" : ""}` : "";
        setWarning(`Downloaded with ${be.count} backend error${be.count === 1 ? "" : "s"}${reason}`);
      } else {
        setOpen(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-line-2 rounded-md bg-bg hover:bg-surface hover:border-accent/40 transition"
        title="Download as CSV"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        CSV
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] rounded-xl border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-4 z-50">
          <div className="text-sm font-medium text-ink mb-3">Export distance data</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="text-xs">
              <span className="block text-ink-3 mb-1">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to}
                className="w-full px-2 py-1.5 border border-line-2 rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </label>
            <label className="text-xs">
              <span className="block text-ink-3 mb-1">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={todayIso()}
                className="w-full px-2 py-1.5 border border-line-2 rounded-md bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </label>
          </div>
          <div className="flex items-center gap-1 mb-3">
            {[
              { label: "Today", f: () => { setFrom(todayIso()); setTo(todayIso()); } },
              { label: "7d",    f: () => { setFrom(daysAgoIso(6));  setTo(todayIso()); } },
              { label: "30d",   f: () => { setFrom(daysAgoIso(29)); setTo(todayIso()); } },
            ].map((p) => (
              <button key={p.label} type="button" onClick={p.f}
                className="text-[11px] px-2 py-0.5 border border-line-2 rounded-full text-ink-2 hover:bg-bg transition">
                {p.label}
              </button>
            ))}
          </div>

          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1.5">Format</div>
            <div className="space-y-1">
              {([
                { value: "individual", label: "Per day",        hint: "One row per rider per date" },
                { value: "merged",     label: "Per rider",      hint: "One row per rider, distance summed over range" },
                { value: "total",      label: "Fleet total",    hint: "Single row, grand total across all riders" },
              ] as { value: ExportMode; label: string; hint: string }[]).map((opt) => (
                <label key={opt.value}
                  className={`flex items-start gap-2 px-2 py-1.5 border rounded-md cursor-pointer transition ${mode === opt.value ? "border-accent/40 bg-accent/5" : "border-line-2 hover:bg-bg"}`}>
                  <input type="radio" name="export-mode" value={opt.value}
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                    className="mt-0.5 accent-accent" />
                  <div className="min-w-0">
                    <div className="text-sm text-ink leading-tight">{opt.label}</div>
                    <div className="text-[11px] text-ink-3 leading-tight">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {err && <div className="text-xs text-bad mb-2">{err}</div>}
          {warning && (
            <div className="text-[11px] text-warn bg-warn/10 border border-warn/25 rounded-md p-2 mb-2 leading-snug">
              {warning}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={download}
              disabled={loading || !from || !to}
              className="flex-1 bg-accent text-accent-ink font-medium py-1.5 rounded-md hover:brightness-95 disabled:opacity-60 text-sm transition"
            >
              {loading ? "Building…" : "Download"}
            </button>
            {fallbackSnapshot && (
              <button
                type="button"
                onClick={() => { fallbackSnapshot(); setOpen(false); }}
                className="text-xs text-ink-3 hover:text-ink px-2 py-1.5"
                title="Quick snapshot of currently-visible rows (no per-date breakdown)"
              >
                Snapshot
              </button>
            )}
            {/* prevent unused warning */}
            <span className="hidden">{fallbackToCsv ? "" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
