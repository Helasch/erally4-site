"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  formatDiff,
  formatTime,
  type RallyResultRow,
  type StageResultRow,
  type StageSplit,
  type StageSummary,
  type StandingRow,
} from "@/lib/api";
import { movementLabel } from "@/lib/format";

const TOP = 15;

function DriverName({ name, id }: { name: string; id: number | null }) {
  return id !== null ? (
    <Link href={`/pilotes/${id}`} className="driver-link">
      {name}
    </Link>
  ) : (
    <span title="Pilote non identifié">{name}</span>
  );
}

/** Recherche par pseudo + affichage du top 15 ou de tout le classement. */
function useFiltered<T extends { name: string }>(rows: T[]) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows), [rows, q]);
  const shown = q || all ? filtered : filtered.slice(0, TOP);
  return { query, setQuery, all, setAll, filtered, shown, searching: q !== "" };
}

function TableCard({
  title,
  meta,
  query,
  setQuery,
  children,
  footer,
}: {
  title: string;
  meta: string;
  query: string;
  setQuery: (v: string) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <article className="card-block table-card">
      <header className="card-head">
        <h2>{title}</h2>
        <span>{meta}</span>
      </header>
      <label className="search">
        <span className="visually-hidden">Rechercher un pilote</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un pilote…" />
      </label>
      {children}
      {footer}
    </article>
  );
}

function ShowAll({
  total,
  all,
  setAll,
  searching,
  found,
}: {
  total: number;
  all: boolean;
  setAll: (v: boolean) => void;
  searching: boolean;
  found: number;
}) {
  if (searching) return found === 0 ? <p className="empty">Aucun pilote ne correspond à cette recherche.</p> : null;
  if (total <= TOP) return null;
  return (
    <button className="show-all" onClick={() => setAll(!all)}>
      {all ? `Revenir au top ${TOP}` : `Afficher les ${total} pilotes`}
    </button>
  );
}

export function StandingsTable({
  rows,
  gainedLabel,
  showStageWins = false,
}: {
  rows: StandingRow[];
  /** En-tête de la colonne des points gagnés (ex. « + Pologne ») ; null pour la masquer */
  gainedLabel: string | null;
  /** Colonne des spéciales gagnées (si des spéciales ont été importées) */
  showStageWins?: boolean;
}) {
  const f = useFiltered(rows);
  const meta = f.searching
    ? `${f.filtered.length} résultat${f.filtered.length > 1 ? "s" : ""}`
    : f.all || rows.length <= TOP
      ? `${rows.length} pilotes classés`
      : `Top ${TOP} sur ${rows.length} pilotes classés`;

  return (
    <TableCard
      title="Championnat"
      meta={meta}
      query={f.query}
      setQuery={f.setQuery}
      footer={<ShowAll total={rows.length} all={f.all} setAll={f.setAll} searching={f.searching} found={f.filtered.length} />}
    >
      <div className="table-scroll">
        <table className="rank-table rank-table-lg">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Pilote</th>
              <th className="c">Évol.</th>
              {showStageWins && (
                <th className="r hide-sm" title="Spéciales gagnées">
                  ES gagnées
                </th>
              )}
              {gainedLabel && <th className="r">{gainedLabel}</th>}
              <th className="r">Points</th>
            </tr>
          </thead>
          <tbody>
            {f.shown.map((s, i) => {
              const m = movementLabel({ evol: s.evol ?? null, is_new: s.is_new ?? false });
              return (
                <tr key={s.id ?? `${s.driver_id}-${s.position}-${i}`} className={s.identified ? "" : "unidentified"}>
                  <td className={`pos pos-${s.position}`}>{s.position}</td>
                  <td>
                    <DriverName name={s.name} id={s.driver_id} />
                  </td>
                  <td className={`c evol evol-${m.kind}`}>{m.text}</td>
                  {showStageWins && <td className="r hide-sm stage-wins">{s.stage_wins || "–"}</td>}
                  {gainedLabel && <td className="r gained">{s.gained ? `+${s.gained}` : "–"}</td>}
                  <td className="r pts">
                    {s.points}
                    {s.adjustment ? (
                      <sup className="adj-mark" title={(s.adjustment_reasons ?? []).join(" · ")}>
                        *
                      </sup>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AdjustmentNotes rows={rows} />
    </TableCard>
  );
}

export function RallyTable({
  rows,
  title,
  showPoints,
  stages = [],
}: {
  rows: RallyResultRow[];
  title: string;
  showPoints: boolean;
  /** Spéciales du rallye : chaque ligne se déplie pour montrer le parcours du pilote */
  stages?: StageSummary[];
}) {
  const f = useFiltered(rows);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const expandable = stages.length > 0 && rows.some((r) => r.stages?.length);
  const columns = 8 + (showPoints ? 1 : 0);
  const meta = f.searching
    ? `${f.filtered.length} résultat${f.filtered.length > 1 ? "s" : ""}`
    : f.all || rows.length <= TOP
      ? `${rows.length} pilotes à l'arrivée`
      : `Top ${TOP} sur ${rows.length} pilotes à l'arrivée`;

  function toggle(id: number, e?: MouseEvent) {
    // Un clic sur le nom du pilote ouvre son profil, pas le détail
    if (e && (e.target as HTMLElement).closest("a, button")) return;
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  return (
    <TableCard
      title={title}
      meta={meta}
      query={f.query}
      setQuery={f.setQuery}
      footer={<ShowAll total={rows.length} all={f.all} setAll={f.setAll} searching={f.searching} found={f.filtered.length} />}
    >
      {expandable && <p className="table-hint">Touchez un pilote pour voir son classement sur chaque spéciale.</p>}
      <div className="table-scroll">
        <table className={`rank-table rank-table-lg fixed-cols${expandable ? " expandable" : ""}`}>
          <thead>
            <tr>
              <ResultColumns />
              {showPoints && <th className="r col-pts">Pts</th>}
              <th className="toggle-col">
                <span className="visually-hidden">Détail des spéciales</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {f.shown.map((r) => {
              const isOpen = open.has(r.id);
              const canOpen = expandable && (r.stages?.length ?? 0) > 0;
              return (
                <Fragment key={r.id}>
                  <tr
                    className={`${r.identified ? "" : "unidentified"}${isOpen ? " open" : ""}`}
                    onClick={canOpen ? (e) => toggle(r.id, e) : undefined}
                  >
                    <td className={`pos pos-${r.position ?? "nc"}`}>{r.position ?? "NC"}</td>
                    <td>
                      <span className="driver-cell">
                        <DriverName name={r.name} id={r.driver_id} />
                        <span className="platform">{r.platform}</span>
                      </span>
                      <small className="show-sm">
                        {r.platform} · {r.vehicle.replace(/ Rally4$/, "")}
                      </small>
                    </td>
                    <td className="hide-sm muted-cell">{r.vehicle}</td>
                    {r.disqualified ? (
                      <td className="r nc-cell" colSpan={3} title={r.penalty_reason ?? undefined}>
                        Non classé{r.penalty_reason ? ` · ${r.penalty_reason}` : ""}
                      </td>
                    ) : (
                      <>
                        <td className="r time hide-sm">
                          {formatTime(r.time)}
                          <PenaltyMark penalty={r.penalty_s} reason={r.penalty_reason} />
                        </td>
                        <td className="r time muted-cell hide-md">{r.diff_prev ? formatDiff(r.diff_prev) : "—"}</td>
                        <td className="r time hide-sm">{r.diff ? formatDiff(r.diff) : "—"}</td>
                      </>
                    )}
                    <td className="r time only-sm">
                      {r.disqualified ? "NC" : r.position === 1 ? formatTime(r.time) : r.diff ? formatDiff(r.diff) : "—"}
                      {!r.disqualified && <PenaltyMark penalty={r.penalty_s} reason={r.penalty_reason} />}
                    </td>
                    {showPoints && <td className="r pts">{r.points}</td>}
                    <td className="toggle-col">
                      {canOpen && (
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Masquer" : "Afficher"} les spéciales de ${r.name}`}
                          onClick={() => toggle(r.id)}
                        >
                          <span aria-hidden="true">▾</span>
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="splits-row">
                      <td colSpan={columns}>
                        <Splits splits={r.stages ?? []} stages={stages} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}

/** Parcours d'un pilote : son rang sur chaque spéciale (victoires et podiums mis en valeur). */
function Splits({ splits, stages }: { splits: StageSplit[]; stages: StageSummary[] }) {
  const byNumber = new Map(splits.map((s) => [s.number, s]));
  const wins = splits.filter((s) => s.position === 1).length;
  return (
    <div className="splits">
      <ol>
        {stages.map((stage) => {
          const s = byNumber.get(stage.number);
          const kind = !s ? "none" : s.abandoned ? "abandoned" : s.position === 1 ? "win" : s.position <= 3 ? "podium" : "";
          return (
            <li key={stage.number} className={kind} title={stage.name}>
              <span className="split-es">ES{stage.number}</span>
              <strong>{!s ? "—" : s.abandoned ? "Abd." : `P${s.position}`}</strong>
              <span className="split-time">{!s ? "" : s.abandoned ? "Temps max" : formatTime(s.time)}</span>
            </li>
          );
        })}
      </ol>
      {wins > 0 && (
        <p className="splits-note">
          {wins} spéciale{wins > 1 ? "s" : ""} gagnée{wins > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

const MAX_TIME = "Temps maximum attribué par RaceNet (abandon ou spéciale non terminée)";
const RACENET_PENALTY = "Pénalité RaceNet (coupe, faux départ…)";

/** Classement d'une spéciale. */
export function StageTable({ rows, title }: { rows: StageResultRow[]; title: string }) {
  const f = useFiltered(rows);
  const meta = f.searching
    ? `${f.filtered.length} résultat${f.filtered.length > 1 ? "s" : ""}`
    : f.all || rows.length <= TOP
      ? `${rows.length} pilotes`
      : `Top ${TOP} sur ${rows.length} pilotes`;

  return (
    <TableCard
      title={title}
      meta={meta}
      query={f.query}
      setQuery={f.setQuery}
      footer={<ShowAll total={rows.length} all={f.all} setAll={f.setAll} searching={f.searching} found={f.filtered.length} />}
    >
      <div className="table-scroll">
        <table className="rank-table rank-table-lg fixed-cols">
          <thead>
            <tr>
              <ResultColumns />
              <th className="toggle-col" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {f.shown.map((r) => (
              <tr key={r.id} className={`${r.identified ? "" : "unidentified"}${r.abandoned ? " abandoned" : ""}`}>
                <td className={`pos pos-${r.position}`}>{r.position}</td>
                <td>
                  <span className="driver-cell">
                    <DriverName name={r.name} id={r.driver_id} />
                    <span className="platform">{r.platform}</span>
                  </span>
                  <small className="show-sm">
                        {r.platform} · {r.vehicle.replace(/ Rally4$/, "")}
                      </small>
                </td>
                <td className="hide-sm muted-cell">{r.vehicle}</td>
                {r.abandoned ? (
                  <td className="r time muted-cell hide-sm" colSpan={3} title={MAX_TIME}>
                    Temps max · {formatTime(r.time)}
                  </td>
                ) : (
                  <>
                    <td className="r time hide-sm">
                      {formatTime(r.time)}
                      <PenaltyMark penalty={r.penalty_s} reason={RACENET_PENALTY} />
                    </td>
                    <td className="r time muted-cell hide-md">{r.diff_prev ? formatDiff(r.diff_prev) : "—"}</td>
                    <td className="r time hide-sm">{r.diff ? formatDiff(r.diff) : "—"}</td>
                  </>
                )}
                <td className="r time only-sm" title={r.abandoned ? MAX_TIME : undefined}>
                  {r.abandoned ? "Temps max" : r.position === 1 ? formatTime(r.time) : r.diff ? formatDiff(r.diff) : "—"}
                  {!r.abandoned && <PenaltyMark penalty={r.penalty_s} reason={RACENET_PENALTY} />}
                </td>
                <td className="toggle-col" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}

/** Pénalité de temps affichée à côté du temps (motif au survol). */
function PenaltyMark({ penalty, reason }: { penalty: number; reason: string | null }) {
  if (!penalty) return null;
  const seconds = penalty.toLocaleString("fr-FR");
  return (
    <span className="penalty-mark" title={`Dont ${seconds} s de pénalité${reason ? ` · ${reason}` : ""}`}>
      +{seconds} s
    </span>
  );
}

/** Colonnes communes au classement d'un rallye et d'une spéciale (largeurs fixes : les tableaux restent identiques). */
function ResultColumns() {
  return (
    <>
      <th className="col-pos">Pos</th>
      <th className="col-driver">Pilote</th>
      <th className="col-car hide-sm">Voiture</th>
      <th className="col-time r hide-sm">Temps</th>
      <th className="col-gap r hide-md">Écart préc.</th>
      <th className="col-gap r hide-sm">Écart</th>
      <th className="col-mobile r only-sm">Temps / écart</th>
    </>
  );
}

/** Ajustements de points décidés par les organisateurs (article 8), affichés en toute transparence. */
function AdjustmentNotes({ rows }: { rows: StandingRow[] }) {
  const adjusted = rows.filter((r) => r.adjustment);
  if (adjusted.length === 0) return null;
  return (
    <div className="adj-notes">
      <p>* Points ajustés par les organisateurs (article 8 du règlement) :</p>
      <ul>
        {adjusted.map((r) => (
          <li key={`${r.driver_id}-${r.position}`}>
            <strong>{r.name}</strong> — {(r.adjustment_reasons ?? []).join(" ; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
