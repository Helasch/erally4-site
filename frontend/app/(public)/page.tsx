import Link from "next/link";
import { ApiError, apiGet, formatDate, formatDiff, formatTime, type Home } from "@/lib/api";
import { movementLabel, plural, shortRallyName } from "@/lib/format";

export const dynamic = "force-dynamic";

async function loadHome(): Promise<Home | null> {
  try {
    return await apiGet<Home | null>("/api/home");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** « X s'impose devant Y et Z et prend la tête du championnat. » */
function summary(home: Home): string | null {
  const last = home.last_rally;
  if (!last || last.podium.length === 0) return null;
  const [p1, p2, p3] = last.podium;
  let text = `${p1.name} s'impose`;
  if (p2) text += ` devant ${p2.name}${p3 ? ` et ${p3.name}` : ""}`;

  // On ne parle du championnat que si le classement est à jour après ce rallye
  const leader = home.standings.leader;
  if (leader && home.standings.after?.id === last.id) {
    if (leader.driver_id !== null && leader.driver_id === p1.driver_id) {
      text += leader.was_leader ? " et conforte sa place de leader." : " et prend la tête du championnat.";
    } else {
      text += `. ${leader.name} reste en tête du championnat.`;
    }
  } else {
    text += ".";
  }
  return text;
}

function DriverName({ name, id }: { name: string; id: number | null }) {
  return id !== null ? (
    <Link href={`/pilotes/${id}`} className="driver-link">
      {name}
    </Link>
  ) : (
    <span>{name}</span>
  );
}

export default async function HomePage() {
  const home = await loadHome();

  if (!home) {
    return (
      <section className="hero hero-empty">
        <div className="hero-inner">
          <p className="hero-kicker">Saison à venir</p>
          <h1 className="hero-title">eRally4 Cup</h1>
          <p className="hero-text">Le championnat démarre bientôt. Revenez après la première manche !</p>
        </div>
      </section>
    );
  }

  const last = home.last_rally;
  const { standings, calendar } = home;
  const leader = standings.leader;

  return (
    <>
      {/* --- En-tête : dernière manche + podium --- */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            {last ? (
              <>
                <p className="hero-kicker">
                  Manche {last.round} sur {home.total_rounds} · Terminée
                </p>
                <h1 className="hero-title">{last.name}</h1>
                <p className="hero-text">{summary(home)}</p>
                <div className="hero-actions">
                  <Link href={`/classements?rallye=${last.id}`} className="btn btn-red">
                    Résultats de la manche
                  </Link>
                  <Link href="/classements" className="btn btn-outline">
                    Classement général
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="hero-kicker">{home.championship.name}</p>
                <h1 className="hero-title">La saison va commencer</h1>
                <p className="hero-text">Premier rallye à venir, consultez le calendrier.</p>
                <div className="hero-actions">
                  <Link href="/calendrier" className="btn btn-red">
                    Voir le calendrier
                  </Link>
                </div>
              </>
            )}
          </div>

          {last && last.podium.length > 0 && (
            <aside className="podium-card" aria-label={`Podium — ${last.name}`}>
              <header>
                <h2>Podium</h2>
                <span>{last.name}</span>
              </header>
              <ol>
                {last.podium.map((p) => (
                  <li key={p.position} className={`p${p.position}`}>
                    <span className="podium-pos">{p.position}</span>
                    <span className="podium-driver">
                      <DriverName name={p.name} id={p.driver_id} />
                      <small>{p.vehicle}</small>
                    </span>
                    <span className="podium-time">
                      {p.position === 1 ? formatTime(p.time) : formatDiff(p.diff)}
                    </span>
                  </li>
                ))}
              </ol>
              <Link href={`/classements?rallye=${last.id}`} className="text-link">
                Voir le top 10 complet →
              </Link>
            </aside>
          )}
        </div>
      </section>

      {/* --- Chiffres clés --- */}
      <section className="stats" aria-label="Chiffres clés">
        <div className="stats-inner">
          <div className="stat">
            <strong>
              {home.completed_rounds} / {home.total_rounds}
            </strong>
            <span>Manches disputées</span>
          </div>
          <div className="stat">
            <strong>{standings.count || "—"}</strong>
            <span>Pilotes classés</span>
          </div>
          <div className="stat">
            <strong>{leader?.gap != null ? `+${leader.gap}` : "—"}</strong>
            <span>Avance du leader (pts)</span>
          </div>
          <div className="stat">
            <strong>{leader ? leader.wins : "—"}</strong>
            <span>{leader ? `Victoire${leader.wins > 1 ? "s" : ""} de ${leader.name}` : "Victoires du leader"}</span>
          </div>
        </div>
      </section>

      {/* --- Top 5 championnat + dernier rallye --- */}
      <section className="band band-grey">
        <div className="band-inner cards-2">
          <article className="card-block">
            <header className="card-head">
              <h2>Championnat</h2>
              <span>{standings.after ? `Top 5 après la manche ${standings.after.round}` : "Top 5"}</span>
            </header>
            {standings.top5.length === 0 ? (
              <p className="empty">Classement publié après le premier rallye.</p>
            ) : (
              <table className="rank-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Pilote</th>
                    <th className="c">Évol.</th>
                    <th className="r">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.top5.map((s) => {
                    const m = movementLabel(s);
                    return (
                      <tr key={s.id ?? `${s.driver_id}-${s.position}`}>
                        <td className={`pos pos-${s.position}`}>{s.position}</td>
                        <td>
                          <DriverName name={s.name} id={s.driver_id} />
                        </td>
                        <td className={`c evol evol-${m.kind}`}>{m.text}</td>
                        <td className="r pts">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Link href="/classements" className="text-link">
              Classement complet →
            </Link>
          </article>

          {last && (
            <article className="card-block">
              <header className="card-head">
                <h2>{shortRallyName(last.name)}</h2>
                <span>Top 5 du rallye</span>
              </header>
              <table className="rank-table">
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Pilote</th>
                    <th className="r">Temps / écart</th>
                  </tr>
                </thead>
                <tbody>
                  {last.top5.map((p) => (
                    <tr key={p.position}>
                      <td className={`pos pos-${p.position}`}>{p.position}</td>
                      <td>
                        <DriverName name={p.name} id={p.driver_id} />
                      </td>
                      <td className="r time">{p.position === 1 ? formatTime(p.time) : formatDiff(p.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href={`/classements?rallye=${last.id}`} className="text-link">
                Résultats complets →
              </Link>
            </article>
          )}
        </div>
      </section>

      {/* --- Calendrier --- */}
      <section className="band">
        <div className="band-inner">
          <header className="section-head">
            <h2>Calendrier</h2>
            <span>
              {plural(home.total_rounds, "manche")} · {plural(home.completed_rounds, "disputée")}
            </span>
          </header>
          <ol className="calendar">
            {calendar.map((r) => {
              const done = r.has_results;
              const body = (
                <>
                  <span className="cal-round">
                    <span className="cal-num">{r.round}</span>
                    <span className="cal-label">Manche {r.round}</span>
                  </span>
                  <span className="cal-name">{shortRallyName(r.name)}</span>
                  <span className={`cal-status ${done ? "done" : "todo"}`}>{done ? "Terminé" : "À venir"}</span>
                  <span className="cal-meta">
                    {done && r.winner ? (
                      <>
                        <small>Vainqueur</small>
                        {r.winner.name}
                      </>
                    ) : (
                      <>
                        <small>Date</small>
                        {r.event_date ? formatDate(r.event_date) : "À annoncer"}
                      </>
                    )}
                  </span>
                </>
              );
              return (
                <li key={r.id} className={done ? "done" : "todo"}>
                  {done ? <Link href={`/classements?rallye=${r.id}`}>{body}</Link> : <div>{body}</div>}
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}
