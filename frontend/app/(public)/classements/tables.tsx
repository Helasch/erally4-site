"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatDiff, formatTime, type RallyResultRow, type StandingRow } from "@/lib/api";
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
}: {
  rows: StandingRow[];
  /** En-tête de la colonne des points gagnés (ex. « + Pologne ») ; null pour la masquer */
  gainedLabel: string | null;
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
                  {gainedLabel && <td className="r gained">{s.gained ? `+${s.gained}` : "–"}</td>}
                  <td className="r pts">{s.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}

export function RallyTable({ rows, title, showPoints }: { rows: RallyResultRow[]; title: string; showPoints: boolean }) {
  const f = useFiltered(rows);
  const meta = f.searching
    ? `${f.filtered.length} résultat${f.filtered.length > 1 ? "s" : ""}`
    : f.all || rows.length <= TOP
      ? `${rows.length} pilotes à l'arrivée`
      : `Top ${TOP} sur ${rows.length} pilotes à l'arrivée`;

  return (
    <TableCard
      title={title}
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
              <th className="hide-sm">Voiture</th>
              <th className="r hide-sm">Temps</th>
              <th className="r hide-md">Écart préc.</th>
              <th className="r hide-sm">Écart</th>
              <th className="r only-sm">Temps / écart</th>
              {showPoints && <th className="r">Pts</th>}
            </tr>
          </thead>
          <tbody>
            {f.shown.map((r) => (
              <tr key={r.id} className={r.identified ? "" : "unidentified"}>
                <td className={`pos pos-${r.position}`}>{r.position}</td>
                <td>
                  <span className="driver-cell">
                    <DriverName name={r.name} id={r.driver_id} />
                    <span className="platform">{r.platform}</span>
                  </span>
                  <small className="show-sm">{r.vehicle}</small>
                </td>
                <td className="hide-sm muted-cell">{r.vehicle}</td>
                <td className="r time hide-sm">{formatTime(r.time)}</td>
                <td className="r time muted-cell hide-md">{formatDiff(r.diff_prev)}</td>
                <td className="r time hide-sm">{formatDiff(r.diff)}</td>
                <td className="r time only-sm">{r.position === 1 ? formatTime(r.time) : formatDiff(r.diff)}</td>
                {showPoints && <td className="r pts">{r.points}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}
