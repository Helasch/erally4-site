"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminApi, errorMessage, type Driver } from "@/lib/admin-api";
import type { RallyDetail } from "@/lib/api";
import { DriverDatalist } from "../../driver-input";
import { EditableDriver } from "../../editable-driver";

export default function AdminRallyPage() {
  const { id } = useParams<{ id: string }>();
  const [rally, setRally] = useState<RallyDetail | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    adminApi.get<RallyDetail>(`/rallies/${id}/results`).then(setRally).catch((e) => setError(errorMessage(e)));
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
  }, [id]);

  useEffect(reload, [reload]);

  async function clearResults() {
    if (!rally || !confirm(`Supprimer tous les résultats de « ${rally.name} » ?`)) return;
    try {
      await adminApi.delete(`/rallies/${id}/results`);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!rally) return <p className="muted">{error || "Chargement…"}</p>;
  const unidentified = rally.results.filter((r) => !r.identified).length;

  return (
    <main>
      <p>
        <Link href="/admin">← Championnats</Link>
      </p>
      <h1>{rally.name}</h1>
      <p className="muted">
        {rally.championship.name} · {rally.results.length} résultats
        {unidentified > 0 && ` · ${unidentified} non identifié(s)`}
      </p>
      {error && <p className="alert error">{error}</p>}
      <DriverDatalist drivers={drivers} />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Pilote</th>
              <th>Voiture</th>
              <th className="num">Temps</th>
              <th>Plateforme</th>
            </tr>
          </thead>
          <tbody>
            {rally.results.map((r) => (
              <tr key={r.id} className={r.identified ? "" : "anonymous"}>
                <td className="pos">{r.position}</td>
                <td>
                  <EditableDriver
                    endpoint={`/rally-results/${r.id}`}
                    name={r.name}
                    identified={r.identified}
                    onSaved={reload}
                  />
                </td>
                <td className="muted">{r.vehicle}</td>
                <td className="num">{r.time}</td>
                <td>
                  <span className="badge">{r.platform}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="row">
        <Link href="/admin/import">Réimporter un fichier</Link>
        <button className="danger" onClick={clearResults} disabled={rally.results.length === 0}>
          Supprimer les résultats
        </button>
      </p>
    </main>
  );
}
