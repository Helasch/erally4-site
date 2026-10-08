import Link from "next/link";
import {
  apiGet,
  formatDate,
  formatDiff,
  formatTime,
  loadChampionship,
  type ChampionshipListItem,
  type RallyDetail,
} from "@/lib/api";
import { plural, shortRallyName } from "@/lib/format";
import NavSelect from "../nav-select";
import PageHeader from "../page-header";

export const dynamic = "force-dynamic";

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<{ saison?: string }> }) {
  const { saison } = await searchParams;
  const championship = await loadChampionship(saison);

  if (!championship) {
    return (
      <>
        <PageHeader title="Calendrier" subtitle="Les manches de la saison." />
        <section className="band">
          <div className="band-inner">
            <p className="empty">Calendrier à venir.</p>
          </div>
        </section>
      </>
    );
  }

  const rallies = championship.rallies;
  const done = rallies.filter((r) => r.has_results);
  const next = rallies.find((r) => !r.has_results);
  const [seasons, details] = await Promise.all([
    apiGet<ChampionshipListItem[]>("/api/championships"),
    // Podium de chaque manche terminée
    Promise.all(done.map((r) => apiGet<RallyDetail>(`/api/rallies/${r.id}`))),
  ]);
  const podiums = new Map(details.map((d) => [d.id, d.results.slice(0, 3)]));

  return (
    <>
      <PageHeader
        title="Calendrier"
        subtitle={`${championship.name} · ${plural(rallies.length, "manche")} · ${plural(done.length, "disputée")}`}
      >
        {seasons.length > 1 && (
          <div className="head-filters">
            <NavSelect
              label="Saison"
              value={`/calendrier?saison=${championship.id}`}
              options={seasons.map((s) => ({ href: `/calendrier?saison=${s.id}`, label: s.name }))}
            />
          </div>
        )}
      </PageHeader>

      <section className="band band-grey">
        <div className="band-inner">
          {rallies.length === 0 ? (
            <p className="empty">Les manches seront annoncées prochainement.</p>
          ) : (
            <ol className="rounds">
              {rallies.map((r) => {
                const isNext = next?.id === r.id;
                const podium = podiums.get(r.id) ?? [];
                return (
                  <li key={r.id} className={`round ${r.has_results ? "done" : "todo"} ${isNext ? "next" : ""}`}>
                    <span className="round-num">{r.round}</span>
                    <div className="round-main">
                      <p className="round-kicker">
                        Manche {r.round}
                        {isNext && <span className="round-flag">Prochaine manche</span>}
                      </p>
                      <h2 className="round-name">{shortRallyName(r.name)}</h2>
                      <p className="round-date">
                        {r.name !== shortRallyName(r.name) && <span>{r.name} · </span>}
                        {r.event_date ? formatDate(r.event_date) : "Date à annoncer"}
                      </p>
                    </div>
                    {r.has_results ? (
                      <div className="round-results">
                        <ol className="round-podium">
                          {podium.map((p) => (
                            <li key={p.id}>
                              <b>{p.position}</b>
                              <span className="round-driver">
                                {p.driver_id !== null ? (
                                  <Link href={`/pilotes/${p.driver_id}`} className="driver-link">
                                    {p.name}
                                  </Link>
                                ) : (
                                  p.name
                                )}
                              </span>
                              <span className="round-time">
                                {p.position === 1 ? formatTime(p.time) : formatDiff(p.diff)}
                              </span>
                            </li>
                          ))}
                        </ol>
                        <Link href={`/classements?rallye=${r.id}`} className="text-link">
                          Résultats complets →
                        </Link>
                      </div>
                    ) : (
                      <div className="round-results">
                        <span className="cal-status todo">À venir</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
