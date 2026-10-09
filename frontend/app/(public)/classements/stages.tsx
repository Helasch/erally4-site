import Link from "next/link";
import { formatTime, type StageSummary } from "@/lib/api";
import { formatKm, stageConditions } from "@/lib/format";
import StripScroll from "./strip-scroll";

/** Bandeau « Vainqueurs des spéciales » : résumé du rallye, et accès au classement de chaque spéciale. */
export function StageWinners({
  stages,
  current = null,
  hrefFor,
}: {
  stages: StageSummary[];
  current?: number | null;
  hrefFor: (es: number) => string;
}) {
  return (
    <section className="stage-strip" aria-label="Vainqueurs des spéciales">
      <h2 className="strip-title">Vainqueurs des spéciales</h2>
      {current !== null && <StripScroll current={current} />}
      <ol>
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
