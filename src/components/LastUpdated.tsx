"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function LastUpdated({ at }: { at: number }) {
  const router = useRouter();
  const [, tick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <button
      onClick={refresh}
      title="Refresh"
      className="inline-flex items-center gap-1.5 hover:text-ink transition tabular-nums"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "bg-accent animate-pulse" : "bg-good/60"}`} />
      updated {fmt(Date.now() - at)}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? "animate-spin" : ""}>
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  );
}
