import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ApiError,
  apiGet,
  formatDiff,
  formatTime,
  loadChampionship,
  type Championship,
  type ChampionshipListItem,
  type RallyDetail,
  type StageDetail,
  type Standings,
} from "@/lib/api";
import { formatKm, formatRallyDates, plural, shortRallyName, stageConditions } from "@/lib/format";
import NavSelect from "../nav-select";
import PageHeader from "../page-header";
import { StageWinners, ViewHeader } from "./stages";
import { RallyTable, StageTable, StandingsTable } from "./tables";

export const dynamic = "force-dynamic";

type Search = { saison?: string; rallye?: string; apres?: string; es?: string };

const isId = (v?: string) => !!v && /^\d+$/.test(v);

function href(base: Search, extra: Search) {
  const params = new URLSearchParams();
  const merged = { ...base, ...extra };
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return `/classements${qs ? `?${qs}` : ""}`;
}

export default async function ClassementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const championship = await loadChampionship(search.saison);
  // On garde la saison dans les liens seulement si elle a été choisie explicitement
  const keep: Search = isId(search.saison) ? { saison: search.saison } : {};

  if (!championship) {
    return (
      <>
        <PageHeader title="Classements" subtitle="Classement général et résultats de chaque rallye." />
        <section className="band band-grey">
          <div className="band-inner">
            <p className="empty">Aucun championnat en cours pour le moment.</p>
          </div>
        </section>
      </>
    );
  }

  const done = championship.rallies.filter((r) => r.has_results);
  const rallyId = isId(search.rallye) ? Number(search.rallye) : null;
  if (rallyId !== null && !done.some((r) => r.id === rallyId)) notFound();

  return (
    <>
      <PageHeader title="Classements" subtitle="Classement général et résultats de chaque rallye.">
        <nav className="head-tabs" aria-label="Classements">
          <Link href={href(keep, {})} className={rallyId === null ? "active" : ""}>
            Championnat
          </Link>
          {done.map((r) => (
            <Link
              key={r.id}
              href={href(keep, { rallye: String(r.id) })}
              className={rallyId === r.id ? "active" : ""}
            >
              {shortRallyName(r.name)}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <section className="band band-grey">
        <div className="band-inner">
          {rallyId === null ? (
            <ChampionshipView championship={championship} search={search} keep={keep} />
          ) : (
            <RallyView rallyId={rallyId} es={isId(search.es) ? Number(search.es) : null} keep={keep} />
          )}
        </div>
      </section>
    </>
  );
}

async function ChampionshipView({
  championship,
  search,
  keep,
}: {
  championship: Championship;
  search: Search;
  keep: Search;
}) {
  const apres = isId(search.apres) ? `?apres=${search.apres}` : "";
  let standings: Standings;
  try {
    standings = await apiGet<Standings>(`/api/championships/${championship.id}/standings${apres}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const seasons = await apiGet<ChampionshipListItem[]>("/api/championships");
  const rows = standings.standings;
  const leader = rows[0];
  const after = standings.after;

  return (
    <>
      <div className="view-bar">
        <p className="view-label">
          Classement général
          {after ? ` · après la manche ${after.round}, ${after.name}` : ""}
        </p>
        <div className="view-filters">
          {standings.snapshots.length > 1 && after && (
            <NavSelect
              label="Classement après la manche"
              value={href(keep, { apres: String(after.id) })}
              options={[...standings.snapshots]
                .reverse()
                .map((s) => ({ href: href(keep, { apres: String(s.id) }), label: `Après la manche ${s.round}` }))}
            />
          )}
          {seasons.length > 1 && (
            <NavSelect
              label="Saison"
              value={href({ saison: String(championship.id) }, {})}
              options={seasons.map((s) => ({ href: href({ saison: String(s.id) }, {}), label: s.name }))}
            />
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card-block empty">Le classement sera publié après le premier rallye.</p>
      ) : (
        <>
          <ol className="leader-cards">
            {rows.slice(0, 3).map((s, i) => (
              <li key={s.id ?? `${s.driver_id}-${i}`} className={i === 0 ? "first" : ""}>
                <span className="leader-pos">{s.position}</span>
                <span className="leader-body">
                  <span className="leader-name">
                    {s.driver_id !== null ? <Link href={`/pilotes/${s.driver_id}`}>{s.name}</Link> : s.name}
                  </span>
                  <strong>{s.points} pts</strong>
                  <small>{i === 0 ? "Leader du championnat" : `à ${leader.points - s.points} pts du leader`}</small>
                </span>
              </li>
            ))}
          </ol>
          <StandingsTable
            rows={rows}
            gainedLabel={standings.previous && after ? `+ ${shortRallyName(after.name)}` : null}
            showStageWins={standings.has_stages}
          />
        </>
      )}
    </>
  );
}

async function RallyView({ rallyId, es, keep }: { rallyId: number; es: number | null; keep: Search }) {
  const rally = await apiGet<RallyDetail>(`/api/rallies/${rallyId}`);
  const stages = rally.stages ?? [];
  if (es !== null && !stages.some((s) => s.number === es)) notFound();
  const stageHref = (n: number) => href(keep, { rallye: String(rallyId), es: String(n) });
  const podium = rally.results.filter((r) => r.position !== null).slice(0, 3);
  const overall = {
    href: href(keep, { rallye: String(rallyId) }),
    winner: podium[0]?.name ?? null,
    time: podium[0]?.time ?? null,
    finishers: rally.results.filter((r) => r.position !== null).length,
  };
  const totalKm = stages.reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
  const rallyMeta = [
    formatRallyDates(rally.starts_at, rally.ends_at),
    stages.length > 0 ? plural(stages.length, "spéciale") : null,
    totalKm > 0 ? formatKm(Math.round(totalKm * 10) / 10) : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <>
      <div className="view-bar">
        <p className="view-label">
          Résultats · manche {rally.round} · {rally.name}
        </p>
      </div>

      {rally.results.length === 0 && es === null ? (
        <p className="card-block empty">Résultats pas encore publiés.</p>
      ) : (
        <>
          {/* Le podium du rallye reste affiché, y compris sur les spéciales */}
          {podium.length > 0 && (
            <ol className="leader-cards">
              {podium.map((r, i) => (
                <li key={r.id} className={i === 0 ? "first" : ""}>
                  <span className="leader-pos">{r.position}</span>
                  <span className="leader-body">
                    <span className="leader-name">
                      {r.driver_id !== null ? <Link href={`/pilotes/${r.driver_id}`}>{r.name}</Link> : r.name}
                    </span>
                    <strong>{i === 0 || !r.diff ? formatTime(r.time) : formatDiff(r.diff)}</strong>
                    <small>{r.vehicle}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {stages.length > 0 && <StageWinners stages={stages} overall={overall} current={es} hrefFor={stageHref} />}
          {es !== null ? (
            <StageView rallyId={rallyId} es={es} count={stages.length} />
          ) : (
            <>
              <ViewHeader kicker={`Manche ${rally.round}`} title={rally.name} meta={rallyMeta} />
              <RallyTable
                rows={rally.results}
                title="Classement général"
                showPoints={rally.championship.mode === "custom"}
                stages={stages}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

async function StageView({ rallyId, es, count }: { rallyId: number; es: number; count: number }) {
  const stage = await apiGet<StageDetail>(`/api/rallies/${rallyId}/stages/${es}`);
  const meta = [formatKm(stage.distance_km), stageConditions(stage.conditions, stage.time_of_day)].filter(
    (x): x is string => Boolean(x),
  );
  return (
    <>
      <ViewHeader kicker={`Spéciale ${stage.number} sur ${count}`} title={stage.name} meta={meta} />
      <StageTable rows={stage.results} title="Classement de la spéciale" />
    </>
  );
}
