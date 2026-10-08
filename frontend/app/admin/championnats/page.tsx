"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage, type AdminChampionship, type AdminRally } from "@/lib/admin-api";
import { formatRallyDatesLong, statusLabel } from "@/lib/format";

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
        starts_at: data.get("starts_at") || null,
        ends_at: data.get("ends_at") || null,
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
            <thead>
              <tr>
                <th>#</th>
                <th>Rallye</th>
                <th>Dates (heure de Paris)</th>
                <th>Statut</th>
                <th>Résultats</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {c.rallies.map((r, i) => (
                <RallyRow key={r.id} rally={r} round={i + 1} run={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="rally-form" onSubmit={addRally}>
        <label>
          Nom du rallye
          <input name="name" placeholder="ex. Rallye Monte-Carlo" required maxLength={120} />
        </label>
        <label>
          Début
          <input name="starts_at" type="datetime-local" />
        </label>
        <label>
          Fin
          <input name="ends_at" type="datetime-local" />
        </label>
        <button>Ajouter un rallye</button>
      </form>
    </section>
  );
}

// "2026-03-12T20:00:00" -> "2026-03-12T20:00" (format du champ datetime-local)
const toInput = (value: string | null) => (value ? value.slice(0, 16) : "");

function RallyRow({
  rally: r,
  round,
  run,
}: {
  rally: AdminRally;
  round: number;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: r.name, starts_at: toInput(r.starts_at), ends_at: toInput(r.ends_at) });
  const status = statusLabel(r.status);

  async function save() {
    await run(() =>
      adminApi.patch(`/rallies/${r.id}`, {
        name: form.name,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      }),
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <tr>
        <td className="pos">{round}</td>
        <td>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
        </td>
        <td colSpan={3}>
          <div className="row">
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              aria-label="Début"
            />
            →
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              aria-label="Fin"
            />
          </div>
        </td>
        <td className="num">
          <button className="primary" onClick={save}>
            Enregistrer
          </button>
          <button className="link" onClick={() => setEditing(false)}>
            Annuler
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="pos">{round}</td>
      <td>
        <strong>{r.name}</strong>
      </td>
      <td className="muted">{formatRallyDatesLong(r.starts_at, r.ends_at) ?? "Dates à définir"}</td>
      <td>
        <span className={`tag status-${status.kind}`}>{status.text}</span>
      </td>
      <td>
        {r.result_count > 0 ? (
          <Link href={`/admin/rallyes/${r.id}`}>
            {r.result_count} résultats
            {r.unidentified > 0 && ` · ${r.unidentified} non identifié(s)`}
          </Link>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="num">
        <button className="link" onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button
          className="link danger"
          onClick={() => {
            if (confirm(`Supprimer le rallye « ${r.name} » et ses résultats ?`)) run(() => adminApi.delete(`/rallies/${r.id}`));
          }}
        >
          Supprimer
        </button>
      </td>
    </tr>
  );
}
