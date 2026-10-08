import { apiGet, type DriverListItem } from "@/lib/api";
import { plural } from "@/lib/format";
import PageHeader from "../page-header";
import DriverGrid from "./driver-grid";

export const dynamic = "force-dynamic";

export default async function PilotesPage() {
  const data = await apiGet<{ championship: { id: number; name: string } | null; drivers: DriverListItem[] }>(
    "/api/drivers",
  );

  return (
    <>
      <PageHeader
        title="Pilotes"
        subtitle={
          data.championship
            ? `${plural(data.drivers.length, "pilote")} · ${data.championship.name}`
            : "Profils et statistiques des pilotes."
        }
      />
      <section className="band band-grey">
        <div className="band-inner">
          {data.drivers.length === 0 ? (
            <p className="empty">Les pilotes apparaîtront après le premier rallye.</p>
          ) : (
            <DriverGrid drivers={data.drivers} />
          )}
        </div>
      </section>
    </>
  );
}
