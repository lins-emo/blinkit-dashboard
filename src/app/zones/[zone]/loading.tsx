import Shell from "@/components/Shell";
import { KpiSkel, CardSkel, Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <Shell>
      <Skel className="h-3 w-24 mb-3" />
      <div className="mb-5">
        <Skel className="h-7 w-40 mb-1.5" />
        <Skel className="h-3 w-48" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiSkel /><KpiSkel /><KpiSkel /><KpiSkel />
      </div>
      <CardSkel rows={6} />
    </Shell>
  );
}
