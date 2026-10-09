import Link from "next/link";
import { formatTime, type StageSummary } from "@/lib/api";
import { formatKm, stageConditions } from "@/lib/format";
import StripScroll from "./strip-scroll";

export type OverallCard = { href: string; winner: string | null; time: string | null; finishers: number };

/** Bandeau des vainqueurs : carte du général puis une carte par spéciale. Sert aussi à choisir le classement affiché. */
export function StageWinners({
  stages,
  overall,
  current = null,
  hrefFor,
}: {
  stages: StageSummary[];
  overall: OverallCard;
  /** Spéciale affichée (null : classement général du rallye) */
  current?: number | null;
  hrefFor: (es: number) => string;
}) {
  return (
    <section className="stage-strip" aria-label="Vainqueurs du rallye et des spéciales">
      <h2 className="strip-title">Vainqueurs du rallye et des spéciales</h2>
      {current !== null && <StripScroll current={current} />}
      <ol>
        <li className={`strip-overall${current === null ? " active" : ""}`}>
          <Link href={overall.href} scroll={false} aria-current={current === null ? "page" : undefined}>
            <span className="strip-es">Général</span>
            <span className="strip-stage">Classement final</span>
            <span className="strip-meta">
              {overall.finishers} pilote{overall.finishers > 1 ? "s" : ""} à l'arrivée
            </span>
            {overall.winner ? (
              <>
                <strong className="strip-winner">{overall.winner}</strong>
                <span className="strip-time">{overall.time ? formatTime(overall.time) : ""}</span>
              </>
            ) : (
              <span className="strip-meta">—</span>
            )}
          </Link>
        </li>
        {stages.map((s) => (
          <li key={s.number} className={current === s.number ? "active" : ""}>
            <Link href={hrefFor(s.number)} scroll={false} aria-current={current === s.number ? "page" : undefined}>
              <span className="strip-es">ES{s.number}</span>
              <span className="strip-stage" title={s.name}>
                {s.name}
              </span>
              <span className="strip-meta">{[formatKm(s.distance_km), stageConditions(s.conditions, null)].filter(Boolean).join(" · ")}</span>
              {s.winner ? (
                <>
                  <strong className="strip-winner">{s.winner.name}</strong>
                  <span className="strip-time">{formatTime(s.winner.time)}</span>
                </>
              ) : (
                <span className="strip-meta">—</span>
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** En-tête d'une spéciale. */
export function StageHeader({ stage, count }: { stage: StageSummary; count: number }) {
  const meta = [formatKm(stage.distance_km), stageConditions(stage.conditions, stage.time_of_day)].filter(Boolean);
  return (
    <header className="stage-head">
      <p className="stage-kicker">
        Spéciale {stage.number} sur {count}
      </p>
      <h2>{stage.name}</h2>
      {meta.length > 0 && <p className="stage-meta">{meta.join(" · ")}</p>}
    </header>
  );
}
