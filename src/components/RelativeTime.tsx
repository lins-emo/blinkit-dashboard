"use client";
import { useEffect, useState } from "react";

function fmt(deltaMs: number, short: boolean): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 5) return short ? "now" : "just now";
  if (sec < 60) return `${sec}s` + (short ? "" : " ago");
  if (sec < 3600) return `${Math.floor(sec / 60)}m` + (short ? "" : " ago");
  if (sec < 86400) return `${Math.floor(sec / 3600)}h` + (short ? "" : " ago");
  return `${Math.floor(sec / 86400)}d` + (short ? "" : " ago");
}

// Client-only relative time. Renders a stable placeholder during SSR + first paint
// so React's hydration comparison passes, then ticks the live value every 5 s.
export default function RelativeTime({
  t,
  short = true,
  prefix = "",
  placeholder = "—",
}: {
  t: number | null | undefined;
  short?: boolean;
  prefix?: string;
  placeholder?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  if (!t) return <>{placeholder}</>;
  if (now == null) return <>{placeholder}</>;
  return <>{prefix}{fmt(now - t, short)}</>;
}
