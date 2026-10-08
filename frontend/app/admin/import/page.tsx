"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminApi, errorMessage, type AdminChampionship, type Driver } from "@/lib/admin-api";
import { DriverDatalist, DriverInput } from "../driver-input";

type Suggestion = { driver_id: number; name: string; reason: string };

type PreviewRow = {
  line: number;
  position: number;
  name: string;
  anonymous: boolean;
  known_driver: boolean;
  vehicle?: string;
  platform?: string;
  time?: string;
  diff?: string;
  points?: number;
  suggestions: Suggestion[];
};

type Preview = {
  kind: "rally" | "championship";
  row_count: number;
  anonymous_count: number;
  warnings: string[];
  rows: PreviewRow[];
};

export default function ImportPage() {
  const [championships, setChampionships] = useState<AdminChampionship[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [championshipId, setChampionshipId] = useState<number | "">("");
  const [rallyId, setRallyId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.get<AdminChampionship[]>("/championships").then((list) => {
      setChampionships(list);
      const current = list.find((c) => c.is_current) ?? list[0];
      if (current) setChampionshipId(current.id);
    });
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
  }, []);

  const championship = useMemo(
    () => championships.find((c) => c.id === championshipId),
    [championships, championshipId],
  );

  function formData() {
    const data = new FormData();
    data.append("file", file!);
    data.append("championship_id", String(championshipId));
    if (rallyId) data.append("rally_id", String(rallyId));
    return data;
  }

  async function loadPreview() {
    if (!file || !championshipId) return;
    setBusy(true);
    setError("");
    setDone("");
    setPreview(null);
    try {
      const result = await adminApi.post<Preview>("/imports/preview", formData());
      // Pré-remplir chaque « WRC Player » avec la meilleure suggestion
      const initial: Record<number, string> = {};
      const used = new Set<string>();
      for (const row of result.rows) {
        if (!row.anonymous) continue;
        const best = row.suggestions.find((s) => !used.has(s.name));
        if (best) {
          initial[row.line] = best.name;
          used.add(best.name);
        }
      }
      setResolutions(initial);
      setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    if (preview.kind === "rally" && !rallyId) {
      setError("Choisissez le rallye auquel rattacher ce fichier.");
      return;
    }
    const chosen = Object.values(resolutions).map((n) => n.trim().toLowerCase()).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) {
      setError("Le même pilote est attribué à plusieurs lignes « WRC Player ».");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = formData();
      data.append("resolutions", JSON.stringify(resolutions));
      const result = await adminApi.post<{ row_count: number }>("/imports", data);
      setDone(`Import terminé : ${result.row_count} lignes enregistrées.`);
      setPreview(null);
      setFile(null);
      adminApi.get<Driver[]>("/drivers").then(setDrivers);
      adminApi.get<AdminChampionship[]>("/championships").then(setChampionships);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const unresolved = preview?.rows.filter((r) => r.anonymous && !resolutions[r.line]?.trim()).length ?? 0;

  return (
    <main>
      <h1>Importer un CSV RaceNet</h1>
      <DriverDatalist drivers={drivers} />

      <section className="card">
        <label htmlFor="championship">Championnat</label>
        <select
          id="championship"
          value={championshipId}
          onChange={(e) => {
            setChampionshipId(Number(e.target.value));
            setRallyId("");
            setPreview(null);
          }}
        >
          {championships.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {championships.length === 0 && (
          <p className="alert warn">
            Créez d&apos;abord un championnat sur la page <Link href="/admin/championnats">Championnats</Link>.
          </p>
        )}

        <label htmlFor="file">Fichier CSV</label>
        <input
          id="file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setDone("");
          }}
        />
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Le type (rallye ou championnat) est détecté automatiquement.
        </p>

        <label htmlFor="rally">Rallye (pour un fichier de rallye)</label>
        <select
          id="rally"
          value={rallyId}
          onChange={(e) => {
            setRallyId(e.target.value ? Number(e.target.value) : "");
            setPreview(null);
          }}
        >
          <option value="">—</option>
          {championship?.rallies.map((r, i) => (
            <option key={r.id} value={r.id}>
              {i + 1}. {r.name} {r.result_count > 0 ? "(déjà importé)" : ""}
            </option>
          ))}
        </select>

        <p>
          <button className="primary" disabled={!file || !championshipId || busy} onClick={loadPreview}>
            {busy && !preview ? "Analyse…" : "Aperçu"}
          </button>
        </p>
        {error && <p className="alert error">{error}</p>}
        {done && <p className="alert ok">{done}</p>}
      </section>

      {preview && (
        <section>
          <h2>
            Aperçu : {preview.kind === "rally" ? "résultats d'un rallye" : "classement du championnat"} ·{" "}
            {preview.row_count} lignes
          </h2>
          {preview.warnings.map((w) => (
            <p key={w} className="alert warn">
              {w}
            </p>
          ))}
          {preview.anonymous_count > 0 && (
            <p className="muted">
              {preview.anonymous_count} ligne(s) « WRC Player » surlignées : choisissez le pilote correspondant
              (suggestions proposées), ou laissez vide pour corriger plus tard.
            </p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pilote</th>
                  {preview.kind === "rally" ? (
                    <>
                      <th>Voiture</th>
                      <th className="num">Temps</th>
                      <th>Plateforme</th>
                    </>
                  ) : (
                    <th className="num">Points</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={row.anonymous ? "anonymous" : ""}>
                    <td className="pos">{row.position}</td>
                    <td>
                      {row.anonymous ? (
                        <>
                          <DriverInput
                            value={resolutions[row.line] ?? ""}
                            onChange={(v) => setResolutions({ ...resolutions, [row.line]: v })}
                            placeholder="WRC Player — qui est-ce ?"
                          />
                          {row.suggestions.length > 0 && (
                            <div className="suggestions">
                              {row.suggestions.map((s) => (
                                <button
                                  key={s.driver_id}
                                  title={s.reason}
                                  onClick={() => setResolutions({ ...resolutions, [row.line]: s.name })}
                                >
                                  {s.name} <span className="muted">· {s.reason}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {row.name} {!row.known_driver && <span className="badge">nouveau</span>}
                        </>
                      )}
                    </td>
                    {preview.kind === "rally" ? (
                      <>
                        <td className="muted">{row.vehicle}</td>
                        <td className="num">{row.time}</td>
                        <td>
                          <span className="badge">{row.platform}</span>
                        </td>
                      </>
                    ) : (
                      <td className="num">{row.points}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="row">
            <button className="primary" disabled={busy} onClick={confirmImport}>
              {busy ? "Import…" : "Valider l'import"}
            </button>
            {unresolved > 0 && <span className="muted">{unresolved} « WRC Player » resteront non identifiés.</span>}
          </p>
        </section>
      )}
    </main>
  );
}
