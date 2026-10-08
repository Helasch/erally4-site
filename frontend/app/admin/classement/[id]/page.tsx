"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminApi, errorMessage, type Driver } from "@/lib/admin-api";
import type { Standings } from "@/lib/api";
import { DriverDatalist } from "../../driver-input";
import { EditableDriver } from "../../editable-driver";

export default function AdminStandingsPage() {
  const { id } = useParams<{ id: string }>();
  const [standings, setStandings] = useState<Omit<Standings, "championship"> | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    adminApi
      .get<Omit<Standings, "championship">>(`/championships/${id}/standings`)
      .then(setStandings)
      .catch((e) => setError(errorMessage(e)));
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
  }, [id]);

  useEffect(reload, [reload]);

  if (!standings) return <p className="muted">{error || "Chargement…"}</p>;

  return (
    <main>
      <p>
        <Link href="/admin/championnats">← Championnats</Link>
      </p>
      <h1>Classement général importé</h1>
      {standings.mode === "custom" && (
        <p className="alert warn">
          Ce championnat utilise un barème personnalisé : le classement public est calculé depuis les rallyes.
        </p>
      )}
      {standings.unidentified > 0 && (
        <p className="muted">{standings.unidentified} « WRC Player » non identifié(s).</p>
      )}
      {error && <p className="alert error">{error}</p>}
      <DriverDatalist drivers={drivers} />

      {standings.standings.length === 0 ? (
        <p className="card muted">
          Aucun classement importé. <Link href="/admin/import">Importer le CSV championnat</Link>
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Pilote</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.standings.map((row) => (
                <tr key={row.id ?? row.position} className={row.identified ? "" : "anonymous"}>
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
