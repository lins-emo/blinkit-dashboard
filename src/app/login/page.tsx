"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("blinkit");
  const [password, setPassword] = useState("blinkit@emo2026");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) {
      const from = search.get("from") || "/";
      router.replace(from);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "radial-gradient(#1A1A1A 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-accent/30 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shadow-sm">
            <span className="text-accent-ink font-bold text-lg">b</span>
          </div>
          <div>
            <div className="text-ink font-semibold leading-tight">Blinkit Fleet</div>
            <div className="text-ink-3 text-xs">Emo Energy · internal dashboard</div>
          </div>
        </div>
        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2 border border-line-2 rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-line-2 rounded-md bg-bg focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition"
            />
          </div>
          {error && (
            <div className="text-bad text-sm flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-accent-ink font-medium py-2 rounded-md hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-[11px] text-ink-3 text-center mt-4">Authorized personnel only.</p>
      </div>
    </div>
  );
}
