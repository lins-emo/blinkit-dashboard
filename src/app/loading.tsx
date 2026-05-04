import Shell from "@/components/Shell";
import { KpiSkel, CardSkel, Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <Shell>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Skel className="h-7 w-48 mb-1.5" />
          <Skel className="h-3 w-64" />
        </div>
        <Skel className="h-3 w-24" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiSkel /><KpiSkel /><KpiSkel /><KpiSkel />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <CardSkel rows={6} /><CardSkel rows={6} />
      </div>
      <CardSkel rows={5} />
    </Shell>
  );
}
