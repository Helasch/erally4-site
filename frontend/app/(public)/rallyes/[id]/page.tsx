import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApiError, apiGet, formatDate, formatDiff, formatTime, type RallyDetail } from "@/lib/api";
import NavSelect from "../../nav-select";
import SectionTabs from "../../section-tabs";

export const dynamic = "force-dynamic";

export default async function RallyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  let rally: RallyDetail;
  try {
    rally = await apiGet<RallyDetail>(`/api/rallies/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const custom = rally.championship.mode === "custom";
  const withResults = rally.rallies.filter((r) => r.has_results);
  const index = withResults.findIndex((r) => r.id === rally.id);
  const prev = index > 0 ? withResults[index - 1] : null;
  const next = index >= 0 && index < withResults.length - 1 ? withResults[index + 1] : null;

  return (
    <>
      <Suspense>
        <SectionTabs />
      </Suspense>
      <main>
        <div className="rally-heading">
          <span className="round">
            Manche {rally.round} · {rally.championship.name}
          </span>
          <h1 className="section-title">{rally.name}</h1>
          {rally.event_date && <p className="section-subtitle">{formatDate(rally.event_date)}</p>}
        </div>

        <section className="panel">
          <header className="panel-header">
            <h2 className="panel-title">Classement final</h2>
            <div className="row">
              {prev && (
                <Link href={`/rallyes/${prev.id}`} className="pill" aria-label={`Rallye précédent : ${prev.name}`}>
                  ←
                </Link>
              )}
              {withResults.length > 1 && (
                <NavSelect
                  label="Rallye"
                  value={`/rallyes/${rally.id}`}
                  options={withResults.map((r) => ({ href: `/rallyes/${r.id}`, label: `${r.round}. ${r.name}` }))}
                />
              )}
              {next && (
                <Link href={`/rallyes/${next.id}`} className="pill" aria-label={`Rallye suivant : ${next.name}`}>
                  →
                </Link>
              )}
            </div>
          </header>

          {rally.results.length === 0 ? (
            <p className="panel-empty">Résultats pas encore publiés.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Pilote</th>
                    <th className="desktop-only">Voiture</th>
                    <th className="num">Temps</th>
                    <th className="num wide-only">Écart préc.</th>
                    <th className="num">Écart 1er</th>
                    {custom && <th className="num">Pts</th>}
                  </tr>
                </thead>
                <tbody>
                  {rally.results.map((r) => (
                    <tr key={r.id} className={r.position <= 3 ? "podium" : ""}>
                      <td className="pos">{r.position}</td>
                      <td className="name">
                        <span className="badge">{r.platform}</span> {r.name}
                        <span className="sub mobile-only">{r.vehicle}</span>
                      </td>
                      <td className="desktop-only">{r.vehicle}</td>
                      <td className="num time">{formatTime(r.time)}</td>
                      <td className="num time wide-only">{formatDiff(r.diff_prev)}</td>
                      <td className="num time">{formatDiff(r.diff)}</td>
                      {custom && <td className="num total">{r.points}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
