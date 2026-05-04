import Shell from "@/components/Shell";
import { KpiSkel, CardSkel, Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <Shell>
      <Skel className="h-3 w-20 mb-3" />
      <div className="mb-6 flex items-start gap-4">
        <Skel className="h-16 w-16 rounded-full" />
        <div className="flex-1">
          <Skel className="h-7 w-48 mb-1.5" />
          <Skel className="h-3 w-72 mb-3" />
          <div className="flex gap-2">
            <Skel className="h-5 w-20" /><Skel className="h-5 w-24" /><Skel className="h-5 w-28" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <KpiSkel /><KpiSkel /><KpiSkel /><KpiSkel /><KpiSkel />
      </div>
      <div className="rounded-card border border-line bg-surface p-4 mb-5">
        <Skel className="h-3 w-32 mb-3" />
        <Skel className="h-20 w-full" />
      </div>
      <div className="rounded-card border border-line bg-surface overflow-hidden mb-5">
        <Skel className="h-10 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-line">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="px-4 py-3"><Skel className="h-2.5 w-16 mb-1.5" /><Skel className="h-5 w-20" /></div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardSkel rows={4} /><CardSkel rows={4} />
      </div>
    </Shell>
  );
}
