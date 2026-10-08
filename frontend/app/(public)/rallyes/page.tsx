import Link from "next/link";
import { Suspense } from "react";
import { apiGet, formatDate, loadChampionship, type ChampionshipListItem } from "@/lib/api";
import NavSelect from "../nav-select";
import SectionTabs from "../section-tabs";

export const dynamic = "force-dynamic";

export default async function RalliesPage({ searchParams }: { searchParams: Promise<{ saison?: string }> }) {
  const { saison } = await searchParams;
  const championship = await loadChampionship(saison);
  const seasons = championship ? await apiGet<ChampionshipListItem[]>("/api/championships") : [];

  return (
    <>
      <Suspense>
        <SectionTabs />
      </Suspense>
      <main>
        <section className="panel">
          <header className="panel-header">
            <h1 className="panel-title">Rallyes</h1>
            {championship && seasons.length > 1 && (
              <NavSelect
                label="Saison"
                value={`/rallyes?saison=${championship.id}`}
                options={seasons.map((s) => ({ href: `/rallyes?saison=${s.id}`, label: s.name }))}
              />
            )}
          </header>

          {!championship || championship.rallies.length === 0 ? (
            <p className="panel-empty">Calendrier à venir.</p>
          ) : (
            <>
              <p className="panel-meta">{championship.name}</p>
              <div className="table-wrap">
                <table className="list-table">
                  <thead>
                    <tr>
                      <th>Manche</th>
                      <th>Rallye</th>
                      <th className="desktop-only">Date</th>
                      <th>Statut</th>
                      <th className="desktop-only">Vainqueur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {championship.rallies.map((r) => (
                      <tr key={r.id} className={r.has_results ? "clickable" : "upcoming"}>
                        <td className="pos">{r.round}</td>
                        <td className="name">
                          {r.has_results ? (
                            <Link href={`/rallyes/${r.id}`} className="row-link">
                              {r.name}
                            </Link>
                          ) : (
                            r.name
                          )}
                          {r.event_date && <span className="sub mobile-only">{formatDate(r.event_date)}</span>}
                        </td>
                        <td className="desktop-only">{r.event_date ? formatDate(r.event_date) : "—"}</td>
                        <td>
                          <span className={`status ${r.has_results ? "done" : "todo"}`}>
                            {r.has_results ? "Terminé" : "À venir"}
                          </span>
                        </td>
                        <td className="desktop-only">
                          {r.winner ? (
                            <>
                              {r.winner.name} <span className="badge">{r.winner.platform}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
