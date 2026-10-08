import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet, formatDiff, formatGapMs, formatTime, type DriverProfile } from "@/lib/api";
import { ordinal, shortRallyName } from "@/lib/format";
import Avatar from "../../avatar";
import CarVisual from "../../car-visual";
import PageHeader from "../../page-header";

export const dynamic = "force-dynamic";

type Progression = NonNullable<DriverProfile["season"]>["progression"];

/** Courbe de la position au général après chaque manche (1er en haut). */
function ProgressionChart({ points }: { points: Progression }) {
  const W = 600;
  const H = 220;
  const pad = { l: 40, r: 20, t: 20, b: 34 };
  const worst = Math.max(...points.map((p) => p.position), 3);
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (pos: number) => pad.t + ((pos - 1) * (H - pad.t - pad.b)) / (worst - 1);
  const ticks = Array.from(new Set([1, Math.ceil(worst / 2), worst]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Position au championnat après chaque manche">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
          <text x={pad.l - 10} y={y(t) + 4} className="chart-axis" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.position)}`).join(" ")} className="chart-line" />
      {points.map((p, i) => (
        <g key={p.round}>
          <circle cx={x(i)} cy={y(p.position)} r={6} className="chart-dot">
            <title>
              Après la manche {p.round} ({p.rally}) : {ordinal(p.position)}, {p.points} pts
            </title>
          </circle>
          <text x={x(i)} y={y(p.position) - 12} className="chart-value" textAnchor="middle">
            {p.position}
          </text>
          <text x={x(i)} y={H - 10} className="chart-axis" textAnchor="middle">
            M{p.round}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default async function PilotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  let driver: DriverProfile;
  try {
    driver = await apiGet<DriverProfile>(`/api/drivers/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const season = driver.season;
  const stats = season?.stats;
  const custom = season?.championship.mode === "custom";

  return (
    <>
      <PageHeader
        title={driver.name}
        crumbs={[{ href: "/pilotes", label: "Pilotes" }]}
        visual={<CarVisual vehicle={driver.vehicle} />}
      >
        <div className="driver-head">
          <Avatar name={driver.name} url={driver.avatar_url} size={96} />
          <div className="driver-tags">
            {driver.racenet_name && <span className="tag-light">RaceNet : {driver.racenet_name}</span>}
            {driver.platform && <span className="tag-light">{driver.platform}</span>}
            {driver.vehicle && <span className="tag-light">{driver.vehicle}</span>}
            {season && <span className="tag-light">{season.championship.name}</span>}
          </div>
        </div>
      </PageHeader>

      {season && stats ? (
        <>
          <section className="stats" aria-label="Chiffres clés de la saison">
            <div className="stats-inner stats-6">
              <div className="stat">
                <strong>{season.position !== null ? ordinal(season.position) : "—"}</strong>
                <span>Au général{season.position !== null ? ` / ${season.classified}` : ""}</span>
              </div>
              <div className="stat">
                <strong>{season.points ?? "—"}</strong>
                <span>Points</span>
              </div>
              <div className="stat">
                <strong>{stats.wins}</strong>
                <span>Victoire{stats.wins > 1 ? "s" : ""}</span>
              </div>
              <div className="stat">
                <strong>{stats.podiums}</strong>
                <span>Podium{stats.podiums > 1 ? "s" : ""}</span>
              </div>
              <div className="stat">
                <strong>{stats.best !== null ? ordinal(stats.best) : "—"}</strong>
                <span>Meilleur résultat</span>
              </div>
              <div className="stat">
                <strong>{stats.rallies}</strong>
                <span>Rallye{stats.rallies > 1 ? "s" : ""} disputé{stats.rallies > 1 ? "s" : ""}</span>
              </div>
            </div>
          </section>

          <section className="band band-grey">
            <div className="band-inner cards-2">
              <article className="card-block">
                <header className="card-head">
                  <h2>Progression</h2>
                  <span>Position au général après chaque manche</span>
                </header>
                {season.progression.length >= 1 ? (
                  <ProgressionChart points={season.progression} />
                ) : (
                  <p className="empty">La courbe apparaîtra dès qu&apos;un classement général sera publié.</p>
                )}
              </article>

              <article className="card-block">
                <header className="card-head">
                  <h2>En moyenne</h2>
                  <span>Sur la saison</span>
                </header>
                <dl className="facts">
                  <div>
                    <dt>Position moyenne</dt>
                    <dd>{stats.average_position !== null ? stats.average_position.toLocaleString("fr-FR") : "—"}</dd>
                  </div>
                  <div>
                    <dt>Écart moyen au vainqueur</dt>
                    <dd>{stats.average_gap_ms !== null ? formatGapMs(stats.average_gap_ms) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Top 10</dt>
                    <dd>
                      {stats.top10} / {stats.rallies}
                    </dd>
                  </div>
                  <div>
                    <dt>Carrière (toutes saisons)</dt>
                    <dd>
                      {driver.career.rallies} rallye{driver.career.rallies > 1 ? "s" : ""} · {driver.career.wins} victoire
                      {driver.career.wins > 1 ? "s" : ""}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>

          <section className="band">
            <div className="band-inner">
              <header className="section-head">
                <h2>Résultats</h2>
                <span>{season.championship.name}</span>
              </header>
              {season.history.length === 0 ? (
                <p className="empty">Aucun rallye disputé cette saison.</p>
              ) : (
                <div className="table-scroll">
                  <table className="rank-table rank-table-lg">
                    <thead>
                      <tr>
                        <th>Manche</th>
                        <th>Rallye</th>
                        <th className="r">Position</th>
                        <th className="r hide-sm">Temps</th>
                        <th className="r">Écart</th>
                        <th className="hide-sm">Voiture</th>
                        {custom && <th className="r">Pts</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {season.history.map((h) => (
                        <tr key={h.rally_id}>
                          <td className={`pos pos-${h.position}`}>{h.round}</td>
                          <td>
                            <Link href={`/classements?rallye=${h.rally_id}`} className="driver-link">
                              {shortRallyName(h.rally)}
                            </Link>
                          </td>
                          <td className="r">
                            <b>{ordinal(h.position)}</b> <span className="muted-cell">/ {h.finishers}</span>
                          </td>
                          <td className="r time hide-sm">{formatTime(h.time)}</td>
                          <td className="r time">{formatDiff(h.diff)}</td>
                          <td className="hide-sm muted-cell">{h.vehicle}</td>
                          {custom && <td className="r pts">{h.points}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="band">
          <div className="band-inner">
            <p className="empty">Aucun résultat pour ce pilote dans le championnat en cours.</p>
          </div>
        </section>
      )}
    </>
  );
}
