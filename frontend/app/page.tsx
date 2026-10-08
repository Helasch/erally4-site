import { Suspense } from "react";
import { apiGet, loadChampionship, type ChampionshipListItem, type Standings } from "@/lib/api";
import NavSelect from "./nav-select";
import SectionTabs from "./section-tabs";

export const dynamic = "force-dynamic";

export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ saison?: string }> }) {
  const { saison } = await searchParams;
  const championship = await loadChampionship(saison);
  const [standings, seasons] = championship
    ? await Promise.all([
        apiGet<Standings>(`/api/championships/${championship.id}/standings`),
        apiGet<ChampionshipListItem[]>("/api/championships"),
      ])
    : [null, []];

  return (
    <>
      <Suspense>
        <SectionTabs />
      </Suspense>
      <main>
        <section className="panel">
          <header className="panel-header">
            <h1 className="panel-title">Classement général</h1>
            {championship && seasons.length > 1 && (
              <NavSelect
                label="Saison"
                value={`/?saison=${championship.id}`}
                options={seasons.map((s) => ({ href: `/?saison=${s.id}`, label: s.name }))}
              />
            )}
          </header>

          {!championship || !standings ? (
            <p className="panel-empty">Aucun championnat en cours pour le moment.</p>
          ) : standings.standings.length === 0 ? (
            <p className="panel-empty">Le classement sera publié après le premier rallye.</p>
          ) : (
            <>
              <p className="panel-meta">
                {championship.name} ·{" "}
                {standings.mode === "custom" ? "barème du championnat" : "points RaceNet"}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Pilote</th>
                      <th className="num">Points</th>
                      {standings.mode === "custom" &&
                        standings.rallies.map((r, i) => (
                          <th key={r.id} className="num desktop-only" title={r.name}>
                            R{i + 1}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {standings.standings.map((row, i) => (
                      <tr key={row.id ?? `d${row.driver_id}-${i}`} className={row.position <= 3 ? "podium" : ""}>
                        <td className="pos">{row.position}</td>
                        <td className="name">{row.name}</td>
                        <td className="num total">{row.points}</td>
                        {standings.mode === "custom" &&
                          row.per_rally?.map((p, j) => (
                            <td key={j} className="num muted desktop-only">
                              {p ?? "–"}
                            </td>
                          ))}
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
