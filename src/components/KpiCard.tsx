import type { ReactNode } from "react";

type Tone = "default" | "good" | "warn" | "bad" | "accent";

const TONE_STRIP: Record<Tone, string> = {
  default: "before:bg-line-2",
  good:    "before:bg-good",
  warn:    "before:bg-warn",
  bad:     "before:bg-bad",
  accent:  "before:bg-accent",
};

const TONE_LABEL: Record<Tone, string> = {
  default: "text-ink-3",
  good:    "text-ink-3",
  warn:    "text-warn",
  bad:     "text-bad",
  accent:  "text-ink-3",
};

export default function KpiCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string | ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className={`relative rounded-card border border-line bg-surface p-4 overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${TONE_STRIP[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`text-[11px] uppercase tracking-wider font-medium ${TONE_LABEL[tone]}`}>{label}</div>
        {icon && <div className="text-ink-3">{icon}</div>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}
