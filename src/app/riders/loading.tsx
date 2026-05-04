import Shell from "@/components/Shell";
import { CardSkel, Skel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <Shell>
      <div className="mb-5">
        <Skel className="h-7 w-32 mb-1.5" />
        <Skel className="h-3 w-72" />
      </div>
      <CardSkel rows={10} />
    </Shell>
  );
}
