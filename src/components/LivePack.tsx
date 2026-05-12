"use client";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export interface LivePackState {
  packId?: string;
  soc?: number | null;
  voltage?: number | null;
  current?: number | null;
  speed?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  cycleCount?: number | null;
  isMoving?: boolean;
  lastSeen?: string | null;
  packMetrics?: {
    packId?: string;
    date?: string;
    distanceKm?: number;
    energyKwh?: number;
    cycleIncrement?: number;
  };
}

interface Initial {
  soc?: number | null;
  speed?: number | null;
  voltage?: number | null;
  current?: number | null;
  cycleCount?: number | null;
  lastSeen?: number | null;     // ms
}

function ageString(t: number | null): string {
  if (!t) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// Parse "YYYY-MM-DD HH:mm:ss" (IST) → ms.
function parseLastSeen(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, Mo, D, h, mi, se] = m;
  return Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +se) - 5.5 * 60 * 60 * 1000;
}

export default function LivePack({ packId, initial }: { packId: string; initial?: Initial }) {
  const [state, setState] = useState<LivePackState | null>(null);
  const [connected, setConnected] = useState(false);
  const [updates, setUpdates] = useState(0);
  const [, tick] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!packId) return;
    const token = process.env.NEXT_PUBLIC_SENSIOT_WS_TOKEN;
    if (!token) {
      console.warn("[LivePack] NEXT_PUBLIC_SENSIOT_WS_TOKEN missing — live pack disabled");
      return;
    }

    const sock = io(process.env.NEXT_PUBLIC_SENSIOT_BASE_URL ?? "https://sensiot.emo-energy.com", {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = sock;

    sock.on("connect", () => {
      setConnected(true);
      sock.emit("subscribe:pack", { packId });
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("pack:update", (s: LivePackState) => {
      if (s?.packId === packId) {
        setState(s);
        setUpdates((n) => n + 1);
      }
    });
    sock.on("auth:error", (msg) => console.warn("[LivePack] auth:error", msg));

    return () => {
      try { sock.emit("unsubscribe:pack", { packId }); } catch {}
      sock.disconnect();
      socketRef.current = null;
    };
  }, [packId]);

  // Tick to refresh the "Xs ago" label every 2s
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  // Effective values — prefer WS-pushed state, fall back to server-rendered initial
  const soc = state?.soc ?? initial?.soc ?? null;
  const speed = state?.speed ?? initial?.speed ?? null;
  const voltage = state?.voltage ?? initial?.voltage ?? null;
  const current = state?.current ?? initial?.current ?? null;
  const cycles = state?.cycleCount ?? initial?.cycleCount ?? null;
  const lastSeenMs = state?.lastSeen ? parseLastSeen(state.lastSeen) : initial?.lastSeen ?? null;
  const dischargingNow = typeof current === "number" && current < -1;
  const chargingNow = typeof current === "number" && current > 1;

  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex h-2 w-2">
          {connected && <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-50 animate-ping" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? "bg-good" : "bg-ink-3"}`} />
        </span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink">{connected ? "Live" : "Offline"}</span>
        <span className="text-[10px] text-ink-3 tabular-nums">{updates > 0 ? `${updates} updates` : ""}</span>
      </div>

      <span className="hidden md:inline h-4 w-px bg-line-2" />

      <Cell label="SOC" value={soc != null ? `${soc.toFixed(0)}%` : "—"}
        tone={soc != null ? (soc < 20 ? "bad" : soc < 40 ? "warn" : "good") : "muted"} />
      <Cell label="Speed" value={speed != null ? `${speed.toFixed(0)} km/h` : "—"} />
      <Cell label="Voltage" value={voltage != null ? `${voltage.toFixed(1)} V` : "—"} />
      <Cell label="Current"
        value={current != null ? `${current > 0 ? "+" : ""}${current.toFixed(1)} A` : "—"}
        tone={chargingNow ? "good" : dischargingNow ? "warn" : "default"}
        hint={chargingNow ? "charging" : dischargingNow ? "discharging" : undefined} />
      <Cell label="Cycles" value={cycles != null ? cycles.toFixed(1) : "—"} />

      <span className="ml-auto text-[11px] text-ink-3 tabular-nums">
        {lastSeenMs ? `pack signal ${ageString(lastSeenMs)}` : ""}
      </span>
    </div>
  );
}

function Cell({ label, value, tone = "default", hint }: { label: string; value: string; tone?: "default" | "good" | "warn" | "bad" | "muted"; hint?: string }) {
  const toneCls =
    tone === "good" ? "text-good" :
    tone === "warn" ? "text-warn" :
    tone === "bad"  ? "text-bad"  :
    tone === "muted"? "text-ink-3":
                       "text-ink";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${toneCls}`}>{value}</span>
      {hint && <span className="text-[10px] text-ink-3 lowercase">{hint}</span>}
    </div>
  );
}
