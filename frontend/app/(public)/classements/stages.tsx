import Link from "next/link";
import type { StageSummary } from "@/lib/api";
import { formatKm } from "@/lib/format";
import StripScroll from "./strip-scroll";

/** Barre des spéciales, de gauche à droite, puis le classement final tout à droite. */
export function StageBar({
  stages,
  current,
  hrefFor,
  finalHref,
}: {
  stages: StageSummary[];
  /** Spéciale affichée (null : classement final) */
  current: number | null;
  hrefFor: (es: number) => string;
  finalHref: string;
}) {
  return (
    <nav className="stage-bar" aria-label="Spéciales du rallye">
      <StripScroll current={current} />
      <ol>
        {stages.map((s) => (
          <li key={s.number} className={current === s.number ? "active" : ""}>
            <Link
              href={hrefFor(s.number)}
              scroll={false}
              title={s.name}
              aria-current={current === s.number ? "page" : undefined}
            >
              <strong>ES{s.number}</strong>
              <span>{formatKm(s.distance_km) ?? " "}</span>
            </Link>
          </li>
        ))}
        <li className={`bar-final${current === null ? " active" : ""}`}>
          <Link href={finalHref} scroll={false} aria-current={current === null ? "page" : undefined}>
            <strong>Final</strong>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

/** En-tête du classement affiché : rallye (final) ou spéciale. */
export function ViewHeader({ kicker, title, meta }: { kicker: string; title: string; meta: string[] }) {
  return (
    <header className="stage-head">
      <p className="stage-kicker">{kicker}</p>
      <h2>{title}</h2>
      {meta.length > 0 && <p className="stage-meta">{meta.join(" · ")}</p>}
    </header>
  );
}
