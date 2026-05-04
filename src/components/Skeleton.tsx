export function Skel({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded ${className}`} />;
}

export function KpiSkel() {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <Skel className="h-3 w-20 mb-2" />
      <Skel className="h-7 w-24 mb-2" />
      <Skel className="h-3 w-32" />
    </div>
  );
}

export function CardSkel({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <Skel className="h-3 w-32" />
        <Skel className="h-3 w-16" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center gap-3">
            <Skel className="h-7 w-7 rounded-full" />
            <div className="flex-1">
              <Skel className="h-3 w-32 mb-1.5" />
              <Skel className="h-2.5 w-20" />
            </div>
            <Skel className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
