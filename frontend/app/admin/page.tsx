"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi, errorMessage, type AdminChampionship, type Driver } from "@/lib/admin-api";

type ImportRow = { id: number; kind: "rally" | "championship"; rally_id: number | null; filename: string; row_count: number; created_at: string };
type StandingsSummary = { mode: string; unidentified: number; standings: unknown[] };

type Data = {
  championship: AdminChampionship | null;
  drivers: number;
  standings: StandingsSummary | null;
  imports: ImportRow[];
};

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [championships, drivers] = await Promise.all([
        adminApi.get<AdminChampionship[]>("/championships"),
        adminApi.get<Driver[]>("/drivers"),
      ]);
      const championship = championships.find((c) => c.is_current) ?? null;
      const [standings, imports] = championship
        ? await Promise.all([
            adminApi.get<StandingsSummary>(`/championships/${championship.id}/standings`),
            adminApi.get<ImportRow[]>(`/imports?championship_id=${championship.id}`),
          ])
        : [null, []];
      setData({ championship, drivers: drivers.length, standings, imports });
    })().catch((e) => setError(errorMessage(e)));
  }, []);

  if (!data) return <p className="muted">{error || "Chargement…"}</p>;
  const { championship: c, standings } = data;

  if (!c) {
    return (
      <main>
        <h1>Tableau de bord</h1>
        <div className="card empty-state">
          <p>Aucun championnat en cours.</p>
          <Link href="/admin/championnats" className="button primary">
            Créer un championnat
          </Link>
        </div>
      </main>
    );
  }

  const done = c.rallies.filter((r) => r.result_count > 0);
  const unidentifiedRallies = c.rallies.filter((r) => r.unidentified > 0);
  const unidentifiedTotal =
    unidentifiedRallies.reduce((sum, r) => sum + r.unidentified, 0) +
    (c.mode === "racenet" ? standings?.unidentified ?? 0 : 0);
  const nextRally = c.rallies.find((r) => r.result_count === 0);
  const rallyName = (id: number | null) => c.rallies.find((r) => r.id === id)?.name ?? "rallye supprimé";

  const todo: { text: string; href: string; action: string }[] = [];
  for (const r of unidentifiedRallies)
    todo.push({ text: `${r.unidentified} « WRC Player » à identifier · ${r.name}`, href: `/admin/rallyes/${r.id}`, action: "Corriger" });
  if (c.mode === "racenet" && standings && standings.unidentified > 0)
    todo.push({ text: `${standings.unidentified} « WRC Player » à identifier · classement général`, href: `/admin/classement/${c.id}`, action: "Corriger" });
  if (c.mode === "racenet" && standings && standings.standings.length === 0 && done.length > 0)
    todo.push({ text: "Classement général RaceNet pas encore importé", href: "/admin/import", action: "Importer" });
  if (c.mode === "custom" && c.scoring.length === 0)
    todo.push({ text: "Aucun barème défini pour le championnat", href: "/admin/championnats", action: "Définir" });
  if (nextRally) todo.push({ text: `Résultats à importer · ${nextRally.name}`, href: "/admin/import", action: "Importer" });

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="muted">
            {c.name} · {c.mode === "custom" ? "barème personnalisé" : "barème RaceNet"}
          </p>
        </div>
        <Link href="/admin/import" className="button primary">
          Importer un CSV
        </Link>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Rallyes importés</span>
          <span className="kpi-value">
            {done.length}
            <small> / {c.rallies.length}</small>
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Pilotes</span>
          <span className="kpi-value">{data.drivers}</span>
        </div>
        <div className={`kpi ${unidentifiedTotal > 0 ? "kpi-warn" : ""}`}>
          <span className="kpi-label">WRC Player non identifiés</span>
          <span className="kpi-value">{unidentifiedTotal}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Prochain rallye</span>
          <span className="kpi-value kpi-text">{nextRally ? nextRally.name : "—"}</span>
        </div>
      </div>

      <div className="dash-grid">
        <section className="card">
          <h2>À faire</h2>
          {todo.length === 0 ? (
            <p className="muted">Rien à signaler, tout est à jour. ✓</p>
          ) : (
            <ul className="todo-list">
              {todo.map((t) => (
                <li key={t.text}>
                  <span>{t.text}</span>
                  <Link href={t.href}>{t.action} →</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Derniers imports</h2>
          {data.imports.length === 0 ? (
            <p className="muted">Aucun import pour ce championnat.</p>
          ) : (
            <ul className="activity-list">
              {data.imports.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <span className={`tag ${i.kind}`}>{i.kind === "rally" ? "Rallye" : "Général"}</span>
                  <span className="activity-text">
                    {i.kind === "rally" ? rallyName(i.rally_id) : "Classement championnat"} · {i.row_count} lignes
                  </span>
                  <time className="muted">
                    {new Date(i.created_at + "Z").toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
