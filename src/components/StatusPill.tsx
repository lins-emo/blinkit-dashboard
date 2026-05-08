import type { LiveStatus } from "@/lib/intellicar";

const STYLES: Record<string, string> = {
  "on-trip": "bg-good/8 text-good border-good/25",
  "idle":    "bg-warn/10 text-warn border-warn/25",
  "parked":  "bg-line text-ink-2 border-line-2",
  "offline": "bg-bad/8 text-bad border-bad/20",
  "unknown": "bg-line text-ink-3 border-line-2",
  "MOBILIZED":   "bg-good/8 text-good border-good/25",
  "IMMOBILIZED": "bg-bad/8 text-bad border-bad/20",
  "UNKNOWN":     "bg-line text-ink-3 border-line-2",
};

const DOT: Record<string, string> = {
  "on-trip": "bg-good",
  "idle":    "bg-warn",
  "parked":  "bg-ink-3",
  "offline": "bg-bad",
  "unknown": "bg-ink-3",
};

const LABELS: Record<string, string> = {
  "on-trip": "On trip",
  "idle":    "Idle",
  "parked":  "Parked",
  "offline": "Offline",
  "unknown": "—",
};

export function LiveStatusPill({ status }: { status: LiveStatus }) {
  const animated = status === "on-trip";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium border rounded-full ${STYLES[status]}`}>
      <span className="relative flex h-1.5 w-1.5">
        {animated && <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-60 animate-ping" />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      </span>
      {LABELS[status] ?? status}
    </span>
  );
}

export function VehicleStatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium border rounded-full ${STYLES[status] ?? STYLES.UNKNOWN}`}>
      {status === "MOBILIZED" ? "Mobilized" : status === "IMMOBILIZED" ? "Immobilized" : status}
    </span>
  );
}

