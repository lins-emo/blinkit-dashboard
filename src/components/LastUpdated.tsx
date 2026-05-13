"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import RelativeTime from "./RelativeTime";

export default function LastUpdated({ at }: { at: number }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

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
      <span>updated <RelativeTime t={at} short={false} placeholder="just now" /></span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? "animate-spin" : ""}>
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  );
}
