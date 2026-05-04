import Shell from "@/components/Shell";
import RidersTable from "@/components/RidersTable";
import { getAllRiderRows } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RidersIndex() {
  const rows = await getAllRiderRows();
  return (
    <Shell>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Riders</h1>
        <p className="text-sm text-ink-3 mt-0.5">All Blinkit riders with live status and distance.</p>
      </div>
      <RidersTable rows={rows} />
    </Shell>
  );
}
