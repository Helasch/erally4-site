"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminApiError, adminApi, errorMessage, type Driver } from "@/lib/admin-api";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const reload = useCallback(() => {
    adminApi.get<Driver[]>("/drivers").then(setDrivers).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(reload, [reload]);

  async function rename(driver: Driver) {
    const name = prompt("Nouveau pseudo (corrigé partout sur le site)", driver.name);
    if (!name || name === driver.name) return;
    setError("");
    setInfo("");
    try {
      await adminApi.patch(`/drivers/${driver.id}`, { name });
      setInfo(`« ${driver.name} » renommé en « ${name} ».`);
      reload();
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 409 && e.detail?.existing_id) {
        if (
          confirm(
            `${e.message}\nFusionner « ${driver.name} » dans ce pilote ? Tous ses résultats lui seront rattachés.`,
          )
        ) {
          try {
            await adminApi.post(`/drivers/${driver.id}/merge`, { into_id: e.detail.existing_id });
            setInfo(`« ${driver.name} » fusionné dans « ${name} ».`);
            reload();
          } catch (err) {
            setError(errorMessage(err));
          }
        }
      } else {
        setError(errorMessage(e));
      }
    }
  }

  if (!drivers) return <p className="muted">{error || "Chargement…"}</p>;
  const shown = drivers.filter((d) => d.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <main>
      <h1>Pilotes</h1>
      <p className="muted">
        Renommer un pilote corrige son pseudo dans tous les classements. Renommer vers un pseudo existant propose
        de fusionner les deux pilotes.
      </p>
      {error && <p className="alert error">{error}</p>}
      {info && <p className="alert ok">{info}</p>}
      <input placeholder="Rechercher…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="num">
                  <button className="link" onClick={() => rename(d)}>
                    Renommer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{drivers.length} pilote(s)</p>
    </main>
  );
}
