import Link from "next/link";
import { formatTime, type StageSummary } from "@/lib/api";
import { formatKm, stageConditions } from "@/lib/format";

/** Onglets de la vue rallye : général puis une pastille par spéciale (défilement horizontal sur mobile). */
export function StageTabs({
  stages,
  current,
  hrefFor,
}: {
  stages: StageSummary[];
  current: number | null;
  hrefFor: (es: number | null) => string;
}) {
  return (
    <nav className="stage-tabs" aria-label="Spéciales">
      <Link href={hrefFor(null)} className={current === null ? "active" : ""} scroll={false}>
        Général
      </Link>
      {stages.map((s) => (
        <Link
          key={s.number}
          href={hrefFor(s.number)}
          className={current === s.number ? "active" : ""}
          title={s.name}
          scroll={false}
        >
          ES{s.number}
        </Link>
      ))}
    </nav>
  );
}

/** Bandeau « Vainqueurs des spéciales » : le résumé du rallye d'un coup d'œil. */
export function StageWinners({ stages, hrefFor }: { stages: StageSummary[]; hrefFor: (es: number) => string }) {
  return (
    <section className="stage-strip" aria-label="Vainqueurs des spéciales">
      <h2 className="strip-title">Vainqueurs des spéciales</h2>
      <ol>
        {stages.map((s) => (
          <li key={s.number}>
            <Link href={hrefFor(s.number)} scroll={false}>
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

/** En-tête d'une spéciale, avec navigation vers la précédente et la suivante. */
export function StageHeader({
  stage,
  count,
  hrefFor,
}: {
  stage: StageSummary;
  count: number;
  hrefFor: (es: number) => string;
}) {
  const meta = [formatKm(stage.distance_km), stageConditions(stage.conditions, stage.time_of_day)].filter(Boolean);
  return (
    <header className="stage-head">
      <div>
        <p className="stage-kicker">
          Spéciale {stage.number} sur {count}
        </p>
        <h2>{stage.name}</h2>
        {meta.length > 0 && <p className="stage-meta">{meta.join(" · ")}</p>}
      </div>
      <nav className="stage-arrows" aria-label="Spéciale précédente ou suivante">
        {stage.number > 1 ? (
          <Link href={hrefFor(stage.number - 1)} scroll={false} aria-label={`ES${stage.number - 1}`}>
            ‹ ES{stage.number - 1}
          </Link>
        ) : (
          <span />
        )}
        {stage.number < count && (
          <Link href={hrefFor(stage.number + 1)} scroll={false} aria-label={`ES${stage.number + 1}`}>
            ES{stage.number + 1} ›
          </Link>
        )}
      </nav>
    </header>
  );
}
