"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminApi, errorMessage, type AdminChampionship, type Driver } from "@/lib/admin-api";
import { DriverDatalist, DriverInput } from "../driver-input";
import { RacenetImport } from "./racenet-import";

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

/** Effet d'une spéciale importée sur le général du rallye et ses points */
type StageImpact = {
  possible: boolean;
  stage_count: number;
  classified_before: number;
  classified_after: number;
  recompute_default: boolean;
  changes: {
    name: string;
    position_before: number | null;
    position_after: number | null;
    points_before: number;
    points_after: number;
  }[];
};

type Preview = {
  kind: "rally" | "championship" | "stage";
  row_count: number;
  anonymous_count: number;
  warnings: string[];
  rows: PreviewRow[];
  stage?: { number: number; name: string | null; exists: boolean; replaced: number };
  general?: StageImpact;
};

function place(position: number | null) {
  return position === null ? "non classé" : `${position}${position === 1 ? "er" : "e"}`;
}

export default function ImportPage() {
  const [championships, setChampionships] = useState<AdminChampionship[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [championshipId, setChampionshipId] = useState<number | "">("");
  const [rallyId, setRallyId] = useState<number | "">("");
  // Contenu d'un fichier au format rallye : le classement du rallye, ou une seule spéciale
  const [target, setTarget] = useState<"rally" | "stage">("rally");
  const [stageNumber, setStageNumber] = useState<number | "">("");
  const [stageName, setStageName] = useState("");
  const [recompute, setRecompute] = useState(true);
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
  const rally = championship?.rallies.find((r) => r.id === rallyId);
  const stageCount = rally?.stage_count ?? 0;

  function formData() {
    const data = new FormData();
    data.append("file", file!);
    data.append("championship_id", String(championshipId));
    if (rallyId) data.append("rally_id", String(rallyId));
    if (target === "stage" && stageNumber) data.append("stage_number", String(stageNumber));
    return data;
  }

  async function loadPreview() {
    if (!file || !championshipId) return;
    if (target === "stage" && (!rallyId || !stageNumber)) {
      setError("Choisissez le rallye et la spéciale correspondant au fichier.");
      return;
    }
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
      setRecompute(result.general?.recompute_default ?? true);
      setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    if (!rallyId) {
      setError(
        preview.kind === "rally"
          ? "Choisissez le rallye auquel rattacher ce fichier."
          : "Choisissez après quel rallye ce classement a été exporté.",
      );
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
      if (preview.kind === "stage") {
        if (stageName.trim()) data.append("stage_name", stageName.trim());
        data.append("recompute", String(recompute));
      }
      const result = await adminApi.post<{ row_count: number }>("/imports", data);
      setDone(
        preview.kind === "stage"
          ? `Spéciale ES${preview.stage?.number} enregistrée : ${result.row_count} temps${
              recompute ? ", classement du rallye et points recalculés" : ""
            }.`
          : `Import terminé : ${result.row_count} lignes enregistrées.`,
      );
      setPreview(null);
      setFile(null);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function refresh() {
    adminApi.get<Driver[]>("/drivers").then(setDrivers);
    adminApi.get<AdminChampionship[]>("/championships").then(setChampionships);
  }

  const unresolved = preview?.rows.filter((r) => r.anonymous && !resolutions[r.line]?.trim()).length ?? 0;

  return (
    <main>
      <h1>Importer des résultats</h1>
      <DriverDatalist drivers={drivers} />

      <RacenetImport championship={championship} onImported={refresh} />

      <details className="csv-import">
        <summary>Importer un fichier CSV exporté de RaceNet (méthode de secours)</summary>
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
            Un classement du championnat est reconnu automatiquement. Un fichier de rallye peut contenir le classement
            final du rallye ou une seule spéciale : précisez-le ci-dessous.
          </p>

          <label htmlFor="target">Le fichier contient</label>
          <select
            id="target"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as "rally" | "stage");
              setPreview(null);
            }}
          >
            <option value="rally">Le classement final d&apos;un rallye, ou le classement du championnat</option>
            <option value="stage">Une spéciale d&apos;un rallye</option>
          </select>

          <label htmlFor="rally">Rallye concerné</label>
          <p className="muted" style={{ margin: "0 0 6px" }}>
            Fichier de rallye : le rallye des résultats. Fichier championnat : le rallye après lequel le classement a été
            exporté.
          </p>
          <select
            id="rally"
            value={rallyId}
            onChange={(e) => {
              setRallyId(e.target.value ? Number(e.target.value) : "");
              setStageNumber("");
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

          {target === "stage" && rally && (
            <>
              <label htmlFor="stage">Spéciale</label>
              <select
                id="stage"
                value={stageNumber}
                onChange={(e) => {
                  setStageNumber(e.target.value ? Number(e.target.value) : "");
                  setPreview(null);
                }}
              >
                <option value="">—</option>
                {Array.from({ length: stageCount + 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    ES{n} {n <= stageCount ? "(déjà importée, sera remplacée)" : "(nouvelle)"}
                  </option>
                ))}
              </select>
              {stageNumber !== "" && stageNumber > stageCount && (
                <>
                  <label htmlFor="stage-name">Nom de la spéciale (facultatif)</label>
                  <input
                    id="stage-name"
                    value={stageName}
                    maxLength={120}
                    placeholder={`ES${stageNumber}`}
                    onChange={(e) => setStageName(e.target.value)}
                  />
                </>
              )}
            </>
          )}

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
              Aperçu :{" "}
              {preview.kind === "stage"
                ? `spéciale ES${preview.stage?.number}${
                    preview.stage?.name && preview.stage.name !== `ES${preview.stage.number}` ? ` (${preview.stage.name})` : ""
                  }`
                : preview.kind === "rally"
                  ? "résultats d'un rallye"
                  : "classement du championnat"}{" "}
              · {preview.row_count} lignes
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
                    {preview.kind !== "championship" ? (
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
                      {preview.kind !== "championship" ? (
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

            {preview.kind === "stage" && preview.general && (
              <StageImpactCard impact={preview.general} recompute={recompute} setRecompute={setRecompute} />
            )}

            <p className="row">
              <button className="primary" disabled={busy} onClick={confirmImport}>
                {busy ? "Import…" : "Valider l'import"}
              </button>
              {unresolved > 0 && <span className="muted">{unresolved} « WRC Player » resteront non identifiés.</span>}
            </p>
          </section>
        )}
      </details>
    </main>
  );
}

/** Effet de la spéciale sur le classement du rallye et ses points, avec le choix de recalculer le général */
function StageImpactCard({
  impact,
  recompute,
  setRecompute,
}: {
  impact: StageImpact;
  recompute: boolean;
  setRecompute: (value: boolean) => void;
}) {
  return (
    <section className="card">
      <h3>Classement du rallye et points</h3>
      {impact.possible ? (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={recompute} onChange={(e) => setRecompute(e.target.checked)} />
            Recalculer le classement du rallye à partir des {impact.stage_count} spéciales (ES1 à ES{impact.stage_count})
          </label>
          <p className="muted">
            Comme le général de RaceNet : pilotes classés sur toutes les spéciales, au temps total. Les pénalités déjà
            décidées sont conservées, et les points du championnat suivent automatiquement.
            {!impact.recompute_default &&
              " Cette spéciale s'ajoute après la dernière importée : ne cochez que si toutes les spéciales du rallye sont là."}
          </p>
          {recompute &&
            (impact.changes.length === 0 ? (
              <p className="alert ok">Aucun changement au classement ni aux points du rallye.</p>
            ) : (
              <>
                <p>
                  {impact.classified_after} pilotes classés au rallye (contre {impact.classified_before}) ·{" "}
                  {impact.changes.length} changement(s) :
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pilote</th>
                        <th>Place au rallye</th>
                        <th className="num">Points du rallye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.changes.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td>
                            {c.position_before === c.position_after ? (
                              place(c.position_after)
                            ) : (
                              <>
                                {place(c.position_before)} → <strong>{place(c.position_after)}</strong>
                              </>
                            )}
                          </td>
                          <td className="num">
                            {c.points_before === c.points_after ? (
                              c.points_after
                            ) : (
                              <>
                                {c.points_before} → <strong>{c.points_after}</strong>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
        </>
      ) : (
        <p className="alert warn">
          Le classement du rallye ne peut pas être recalculé tant que les spéciales précédentes ne sont pas importées.
        </p>
      )}
    </section>
  );
}
