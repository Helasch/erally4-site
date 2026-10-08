"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage, type AdminChampionship } from "@/lib/admin-api";

export default function AdminHome() {
  const [championships, setChampionships] = useState<AdminChampionship[] | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    adminApi
      .get<AdminChampionship[]>("/championships")
      .then(setChampionships)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(reload, [reload]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await run(() => adminApi.post("/championships", { name: data.get("name"), mode: data.get("mode") }));
    form.reset();
  }

  if (!championships) return <p className="muted">{error || "Chargement…"}</p>;

  return (
    <main>
      <h1>Championnats</h1>
      {error && <p className="alert error">{error}</p>}

      {championships.map((c) => (
        <ChampionshipCard key={c.id} championship={c} run={run} />
      ))}

      <form className="card" onSubmit={create}>
        <h2 style={{ marginTop: 0 }}>Nouveau championnat</h2>
        <div className="row">
          <input name="name" placeholder="ex. eRally4 Cup 2026" required maxLength={120} />
          <select name="mode" defaultValue="racenet">
            <option value="racenet">Barème RaceNet</option>
            <option value="custom">Barème personnalisé</option>
          </select>
          <button className="primary">Créer</button>
        </div>
      </form>
    </main>
  );
}

function ChampionshipCard({
  championship: c,
  run,
}: {
  championship: AdminChampionship;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [scoring, setScoring] = useState(c.scoring.join(", "));

  function saveScoring() {
    const points = scoring
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((p) => Number(p));
    if (points.some((p) => !Number.isInteger(p) || p < 0)) {
      alert("Le barème doit contenir des nombres entiers positifs, séparés par des virgules.");
      return;
    }
    run(() => adminApi.put(`/championships/${c.id}/scoring`, { points }));
  }

  async function addRally(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    await run(() =>
      adminApi.post(`/championships/${c.id}/rallies`, {
        name: data.get("name"),
        event_date: data.get("event_date") || null,
      }),
    );
    form.reset();
  }

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          {c.name} {c.is_current && <span className="badge">en cours</span>}
        </h2>
        <div className="row">
          {!c.is_current && (
            <button onClick={() => run(() => adminApi.patch(`/championships/${c.id}`, { is_current: true }))}>
              Définir comme en cours
            </button>
          )}
          <button
            onClick={() => {
              const name = prompt("Nouveau nom du championnat", c.name);
              if (name) run(() => adminApi.patch(`/championships/${c.id}`, { name }));
            }}
          >
            Renommer
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Supprimer « ${c.name} » et tous ses résultats ? Action définitive.`))
                run(() => adminApi.delete(`/championships/${c.id}`));
            }}
          >
            Supprimer
          </button>
        </div>
      </div>

      <label>Classement général</label>
      <div className="row">
        <select
          value={c.mode}
          onChange={(e) => run(() => adminApi.patch(`/championships/${c.id}`, { mode: e.target.value }))}
        >
          <option value="racenet">Barème RaceNet (import du CSV championnat)</option>
          <option value="custom">Barème personnalisé (calculé depuis les rallyes)</option>
        </select>
        {c.mode === "racenet" && (
          <Link href={`/admin/classement/${c.id}`}>Voir / corriger le classement importé</Link>
        )}
      </div>

      {c.mode === "custom" && (
        <>
          <label htmlFor={`scoring-${c.id}`}>Points par place (1er, 2e, 3e…)</label>
          <div className="row">
            <input
              id={`scoring-${c.id}`}
              value={scoring}
              onChange={(e) => setScoring(e.target.value)}
              placeholder="25, 18, 15, 12, 10, 8, 6, 4, 2, 1"
              style={{ flex: 1, minWidth: 240 }}
            />
            <button className="primary" onClick={saveScoring}>
              Enregistrer le barème
            </button>
          </div>
          {c.scoring.length === 0 && (
            <p className="alert warn">Aucun barème défini : tous les pilotes ont 0 point.</p>
          )}
        </>
      )}

      <label>Rallyes</label>
      {c.rallies.length === 0 && <p className="muted">Aucun rallye pour l&apos;instant.</p>}
      {c.rallies.length > 0 && (
        <div className="table-wrap">
          <table>
            <tbody>
              {c.rallies.map((r, i) => (
                <tr key={r.id}>
                  <td className="pos">{i + 1}</td>
                  <td>
                    <strong>{r.name}</strong>
                    {r.event_date && <span className="muted"> · {r.event_date}</span>}
                  </td>
                  <td>
                    {r.result_count > 0 ? (
                      <Link href={`/admin/rallyes/${r.id}`}>
                        {r.result_count} résultats
                        {r.unidentified > 0 && ` · ${r.unidentified} non identifié(s)`}
                      </Link>
                    ) : (
                      <span className="muted">pas de résultats</span>
                    )}
                  </td>
                  <td className="num">
                    <button
                      className="link"
                      onClick={() => {
                        const name = prompt("Nom du rallye", r.name);
                        if (name === null) return;
                        const date = prompt("Date (AAAA-MM-JJ, vide pour aucune)", r.event_date ?? "");
                        if (date === null) return;
                        run(() => adminApi.patch(`/rallies/${r.id}`, { name, event_date: date || null }));
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      className="link danger"
                      onClick={() => {
                        if (confirm(`Supprimer le rallye « ${r.name} » et ses résultats ?`))
                          run(() => adminApi.delete(`/rallies/${r.id}`));
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="row" onSubmit={addRally} style={{ marginTop: 12 }}>
        <input name="name" placeholder="Nom du rallye (ex. Rallye Monte-Carlo)" required maxLength={120} />
        <input name="event_date" type="date" />
        <button>Ajouter un rallye</button>
      </form>
    </section>
  );
}
