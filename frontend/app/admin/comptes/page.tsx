"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, errorMessage, type Driver } from "@/lib/admin-api";

type Account = {
  id: number;
  discord_username: string;
  site_name: string | null;
  racenet_name: string | null;
  link_status: "none" | "pending" | "linked";
  driver_id: number | null;
  driver_name: string | null;
  vehicle: string | null;
  avatar_url: string | null;
  created_at: string;
  suggestions: { id: number; name: string }[];
};

const STATUS: Record<Account["link_status"], string> = {
  linked: "Relié",
  pending: "En attente",
  none: "Sans pseudo RaceNet",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    adminApi.get<Account[]>("/accounts").then(setAccounts).catch((e) => setError(errorMessage(e)));
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
  }, []);

  useEffect(reload, [reload]);

  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setError("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function link(account: Account, driverName: string) {
    const driver = drivers.find((d) => d.name.toLowerCase() === driverName.trim().toLowerCase());
    if (!driver) {
      setError(`Aucun pilote « ${driverName} » dans les résultats.`);
      return;
    }
    run(() => adminApi.post(`/accounts/${account.id}/link`, { driver_id: driver.id }));
  }

  if (!accounts) return <p className="muted">{error || "Chargement…"}</p>;
  const pending = accounts.filter((a) => a.link_status === "pending");

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Comptes pilotes</h1>
          <p className="muted">
            {accounts.length} compte{accounts.length > 1 ? "s" : ""}
            {pending.length > 0 && ` · ${pending.length} liaison${pending.length > 1 ? "s" : ""} à valider`}
          </p>
        </div>
      </div>
      {error && <p className="alert error">{error}</p>}

      <datalist id="drivers-list">
        {drivers.map((d) => (
          <option key={d.id} value={d.name} />
        ))}
      </datalist>

      {pending.length > 0 && (
        <section className="card">
          <h2>Liaisons à valider</h2>
          <p className="muted">
            Ces pilotes ont indiqué un pseudo RaceNet introuvable dans les résultats (souvent un « WRC Player ») ou
            déjà relié à un autre compte. Choisissez le pilote correspondant.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Pseudo RaceNet déclaré</th>
                  <th>Relier à</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.site_name ?? "—"}</strong>
                      <br />
                      <span className="muted">Discord : {a.discord_username}</span>
                    </td>
                    <td>{a.racenet_name}</td>
                    <td>
                      <div className="row">
                        <input
                          list="drivers-list"
                          value={choice[a.id] ?? ""}
                          onChange={(e) => setChoice({ ...choice, [a.id]: e.target.value })}
                          placeholder="Pseudo dans les résultats"
                        />
                        <button className="primary" onClick={() => link(a, choice[a.id] ?? "")}>
                          Relier
                        </button>
                      </div>
                      {a.suggestions.length > 0 && (
                        <div className="suggestions">
                          {a.suggestions.map((s) => (
                            <button key={s.id} onClick={() => setChoice({ ...choice, [a.id]: s.name })}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Tous les comptes</h2>
        {accounts.length === 0 ? (
          <p className="muted">Aucun compte pour l&apos;instant.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pilote</th>
                  <th>Statut</th>
                  <th>Voiture</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        {a.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.avatar_url} alt="" width={36} height={36} style={{ borderRadius: "50%" }} />
                        ) : (
                          <span className="avatar" style={{ width: 36, height: 36 }}>
                            {(a.site_name ?? a.discord_username).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span>
                          <strong>{a.site_name ?? <em className="muted">pseudo à choisir</em>}</strong>
                          <br />
                          <span className="muted">
                            Discord : {a.discord_username}
                            {a.driver_name && ` · RaceNet : ${a.driver_name}`}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${a.link_status === "linked" ? "championship" : "rally"}`}>
                        {STATUS[a.link_status]}
                      </span>
                    </td>
                    <td className="muted">{a.vehicle ?? "—"}</td>
                    <td className="num">
                      {a.link_status === "linked" && (
                        <button className="link" onClick={() => run(() => adminApi.post(`/accounts/${a.id}/unlink`))}>
                          Délier
                        </button>
                      )}
                      {a.site_name && (
                        <button
                          className="link"
                          onClick={() =>
                            run(
                              () => adminApi.post(`/accounts/${a.id}/reset-name`),
                              `Retirer le pseudo « ${a.site_name} » ? Le pilote devra en choisir un autre.`,
                            )
                          }
                        >
                          Retirer le pseudo
                        </button>
                      )}
                      {a.avatar_url && (
                        <button
                          className="link"
                          onClick={() => run(() => adminApi.delete(`/accounts/${a.id}/avatar`), "Retirer cette photo ?")}
                        >
                          Retirer la photo
                        </button>
                      )}
                      <button
                        className="link danger"
                        onClick={() =>
                          run(
                            () => adminApi.delete(`/accounts/${a.id}`),
                            "Supprimer ce compte ? Ses résultats restent sous le pseudo RaceNet.",
                          )
                        }
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
      </section>
    </main>
  );
}
