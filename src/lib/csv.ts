import type { RiderRow } from "./data";

function escape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMNS: { header: string; get: (r: RiderRow) => string | number | null }[] = [
  { header: "Name",                get: (r) => r.name },
  { header: "Phone",               get: (r) => r.phone },
  { header: "Email",               get: (r) => r.email },
  { header: "Blinkit Rider ID",    get: (r) => r.blinkitRiderId },
  { header: "App ID",              get: (r) => r.appId },
  { header: "City",                get: (r) => r.city },
  { header: "Zone",                get: (r) => r.zone },
  { header: "Landmark",            get: (r) => r.landmark },
  { header: "Vehicle No.",         get: (r) => r.vehicleNo },
  { header: "Vehicle Status",      get: (r) => r.vehicleStatusFlag },
  { header: "Live Status",         get: (r) => r.liveStatus },
  { header: "Battery %",           get: (r) => r.liveBattery != null ? r.liveBattery.toFixed(0) : "" },
  { header: "Speed (km/h)",        get: (r) => r.liveSpeed != null ? r.liveSpeed.toFixed(1) : "" },
  { header: "Distance Today (km)", get: (r) => r.distanceTodayKm != null ? r.distanceTodayKm.toFixed(1) : "" },
  { header: "Distance 7d (km)",    get: (r) => r.distance7dKm != null ? r.distance7dKm.toFixed(1) : "" },
  { header: "Odometer (km)",       get: (r) => r.odometer != null ? r.odometer.toFixed(0) : "" },
  { header: "Last Seen",           get: (r) => r.liveCommTime ? new Date(r.liveCommTime).toISOString() : "" },
];

export function ridersToCsv(rows: RiderRow[]): string {
  const header = COLUMNS.map((c) => c.header).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => escape(c.get(r))).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

export function downloadCsv(filename: string, csv: string): void {
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
