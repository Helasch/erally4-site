"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage, type Driver } from "@/lib/admin-api";
import type { Standings } from "@/lib/api";
import { DriverDatalist } from "../../driver-input";
import { EditableDriver } from "../../editable-driver";

type Adjustment = {
  id: number;
  driver_id: number;
  driver_name: string;
  points: number;
  rally_id: number | null;
  rally_name: string | null;
  reason: string;
  created_at: string;
};

export default function AdminStandingsPage() {
  const { id } = useParams<{ id: string }>();
  const [standings, setStandings] = useState<Omit<Standings, "championship"> | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    adminApi
      .get<Omit<Standings, "championship">>(`/championships/${id}/standings`)
      .then(setStandings)
      .catch((e) => setError(errorMessage(e)));
    adminApi.get<Adjustment[]>(`/championships/${id}/adjustments`).then(setAdjustments);
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
  }, [id]);

  useEffect(reload, [reload]);

  async function addAdjustment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError("");
    try {
      await adminApi.post(`/championships/${id}/adjustments`, {
        driver_name: data.get("driver_name"),
        points: Number(data.get("points")),
        rally_id: data.get("rally_id") ? Number(data.get("rally_id")) : null,
        reason: data.get("reason"),
      });
      form.reset();
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeAdjustment(a: Adjustment) {
    if (!confirm(`Retirer l'ajustement de ${a.points} pts pour ${a.driver_name} ?`)) return;
    try {
      await adminApi.delete(`/adjustments/${a.id}`);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!standings) return <p className="muted">{error || "Chargement…"}</p>;

  return (
    <main>
      <p>
        <Link href="/admin/championnats">← Championnats</Link>
      </p>
      <h1>Classement général</h1>
      {standings.mode === "custom" && (
        <p className="alert warn">
          Barème personnalisé : le classement est calculé depuis les rallyes (pénalités de temps comprises).
        </p>
      )}
      {error && <p className="alert error">{error}</p>}
      <DriverDatalist drivers={drivers} />

      <section className="card">
        <h2>Ajustements de points (article 8)</h2>
        <p className="muted">
          Pour répercuter une pénalité sur le classement général : l&apos;ajustement s&apos;applique à partir du rallye
          choisi, et son motif est affiché publiquement.
        </p>
        {adjustments.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Pilote</th>
                  <th className="num">Points</th>
                  <th>Rallye</th>
                  <th>Motif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.driver_name}</td>
                    <td className="num">
                      <strong>{a.points > 0 ? `+${a.points}` : a.points}</strong>
                    </td>
                    <td className="muted">{a.rally_name ?? "Toute la saison"}</td>
                    <td>{a.reason}</td>
                    <td className="num">
                      <button className="link danger" onClick={() => removeAdjustment(a)}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="rally-form" onSubmit={addAdjustment}>
          <label>
            Pilote (pseudo RaceNet)
            <input name="driver_name" list="known-drivers" required maxLength={64} />
          </label>
          <label>
            Points
            <input name="points" type="number" min={-1000} max={1000} step={1} required placeholder="-10" style={{ width: 90 }} />
          </label>
          <label>
            À partir du rallye
            <select name="rally_id" defaultValue="">
              <option value="">Toute la saison</option>
              {standings.rallies.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.round}. {r.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 220 }}>
            Motif (public)
            <input name="reason" required maxLength={255} placeholder="ex. Coupe de route, ES3 Pologne" />
          </label>
          <button className="primary">Ajouter</button>
        </form>
      </section>

      {standings.unidentified > 0 && (
        <p className="muted">{standings.unidentified} « WRC Player » non identifié(s).</p>
      )}

      {standings.standings.length === 0 ? (
        <p className="card muted">
          Aucun classement. <Link href="/admin/import">Importer un CSV</Link>
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Pilote</th>
                <th className="num">Ajustement</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.standings.map((row, i) => (
                <tr key={row.id ?? `${row.driver_id}-${i}`} className={row.identified ? "" : "anonymous"}>
                  <td className="pos">{row.position}</td>
                  <td>
                    {row.id !== undefined ? (
                      <EditableDriver
                        endpoint={`/racenet-standings/${row.id}`}
                        name={row.name}
                        identified={row.identified}
                        onSaved={reload}
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="num muted" title={(row.adjustment_reasons ?? []).join("\n")}>
                    {row.adjustment ? (row.adjustment > 0 ? `+${row.adjustment}` : row.adjustment) : ""}
                  </td>
                  <td className="num">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
