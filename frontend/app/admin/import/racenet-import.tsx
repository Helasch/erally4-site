"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { adminApi, errorMessage, type AdminChampionship } from "@/lib/admin-api";
import { formatRallyDatesLong } from "@/lib/format";
import {
  RacenetBridgeError,
  bookmarkletHref,
  fetchRacenetEvent,
  racenetGet,
  racenetOpener,
  type RacenetClub,
  type RacenetEvent,
} from "@/lib/racenet-bridge";
import { DriverInput } from "../driver-input";

type Suggestion = { driver_id: number; name: string; reason: string };
type EntryRef = { racenet_id: string; name: string; status: string };

type Preview = {
  event: { id: string; location: string; status: number; starts_at: string | null; ends_at: string | null };
  rally_id: number | null;
  stages: {
    number: number;
    name: string;
    distance_km: number | null;
    conditions: string | null;
    time_of_day: string | null;
    entrants: number;
    winner: (EntryRef & { time: string }) | null;
  }[];
  overall: (EntryRef & { position: number; vehicle: string; platform: string; time: string; diff: string })[];
  standings: (EntryRef & { position: number; points: number })[];
  drivers: {
    new: string[];
    renamed: { from: string; to: string }[];
    attached: number;
    anonymous: { racenet_id: string; vehicle: string; platform: string; suggestions: Suggestion[] }[];
  };
  warnings: string[];
};

const EVENT_STATUS = ["à venir", "en cours", "terminé"];
const TOP = 10;

function errorText(e: unknown) {
  return e instanceof RacenetBridgeError ? e.message : errorMessage(e);
}

function shortTime(time: string) {
  // 00:14:30.554 → 14:30.554 ; 01:06:43.315 → 1:06:43.315
  return time.replace(/^00:/, "").replace(/^0(\d:)/, "$1");
}

/** Lien du favori : React refuse les liens « javascript: », il est donc posé après le rendu. */
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);
  return (
    <a
      ref={ref}
      className="bookmarklet"
      onClick={(e) => {
        e.preventDefault();
        alert("Glissez ce bouton dans votre barre de favoris, puis utilisez-le depuis racenet.com.");
      }}
    >
      eRally4 · RaceNet
    </a>
  );
}

function Instructions({ clubId }: { clubId: string }) {
  return (
    <section className="card">
      <h2>Importer depuis RaceNet</h2>
      <ol className="steps">
        <li>
          <strong>Une seule fois :</strong> glissez ce bouton dans la barre de favoris de votre navigateur{" "}
          <BookmarkletLink />
          <br />
          <span className="muted">Barre de favoris masquée : Ctrl + Maj + B (Chrome, Edge) ou Ctrl + B (Firefox).</span>
        </li>
        <li>
          Ouvrez <a href="https://racenet.com/ea_sports_wrc/clubs/" target="_blank" rel="noreferrer">racenet.com</a>,
          connecté à votre compte, puis cliquez sur le favori.
        </li>
        <li>Cette page s&apos;ouvre dans une nouvelle fenêtre : choisissez l&apos;épreuve, vérifiez l&apos;aperçu, validez.</li>
      </ol>
      {!clubId && (
        <p className="alert warn">
          Renseignez d&apos;abord l&apos;identifiant du club RaceNet dans les{" "}
          <Link href="/admin/parametres">Paramètres</Link>.
        </p>
      )}
      <p className="muted" style={{ marginBottom: 0 }}>
        Le favori utilise votre session RaceNet le temps de l&apos;import, en lecture seule : aucun mot de passe ni
        jeton n&apos;est enregistré par le site.
      </p>
    </section>
  );
}

export function RacenetImport({
  championship,
  onImported,
}: {
  championship: AdminChampionship | undefined;
  onImported: () => void;
}) {
  const [opener, setOpener] = useState<Window | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [club, setClub] = useState<RacenetClub | null>(null);
  const [eventId, setEventId] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rallyId, setRallyId] = useState<number | "">("");
  const [updateDates, setUpdateDates] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState({ overall: false, standings: false });
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ rallyId: number; count: number } | null>(null);

  useEffect(() => {
    setOpener(racenetOpener());
    adminApi
      .get<{ racenet_club_id?: string }>("/settings")
      .then((s) => setClubId(s.racenet_club_id ?? ""))
      .catch(() => setClubId(""));
  }, []);

  // Ouverte par le favori : lecture du championnat du club sur RaceNet
  useEffect(() => {
    if (!opener || !clubId) return;
    setProgress("Connexion à RaceNet…");
    racenetGet<RacenetClub>(opener, `wrc2023clubs/${clubId}?includeChampionship=true`)
      .then((data) => {
        setClub(data);
        const events = data.currentChampionship?.events ?? [];
        const finished = events.filter((e) => e.status === 2);
        setEventId((finished[finished.length - 1] ?? events[0])?.id ?? "");
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setProgress(""));
  }, [opener, clubId]);

  if (clubId === null) return null;
  if (!opener) return <Instructions clubId={clubId} />;

  const racenetChampionship = club?.currentChampionship;
  const events = racenetChampionship?.events ?? [];
  const importedRally = (event: RacenetEvent) =>
    championship?.rallies.find((r) => r.racenet_event_id === event.id && r.result_count > 0);

  async function loadPreview(data: unknown, rally: number | "") {
    const result = await adminApi.post<Preview>("/imports/racenet/preview", {
      championship_id: championship!.id,
      rally_id: rally || null,
      payload: data,
    });
    setPreview(result);
    setRallyId(result.rally_id ?? "");
    const target = championship?.rallies.find((r) => r.id === result.rally_id);
    setUpdateDates(Boolean(result.event.starts_at) && (!target?.starts_at || !target?.ends_at));
    // Pré-remplir chaque pilote masqué avec la meilleure suggestion
    const initial: Record<string, string> = {};
    for (const a of result.drivers.anonymous) if (a.suggestions[0]) initial[a.racenet_id] = a.suggestions[0].name;
    setResolutions(initial);
  }

  async function fetchEvent() {
    const event = events.find((e) => e.id === eventId);
    if (!event || !racenetChampionship || !championship || !clubId) return;
    setError("");
    setDone(null);
    setPreview(null);
    try {
      const data = await fetchRacenetEvent(opener!, clubId, racenetChampionship, event, setProgress);
      setPayload(data);
      setProgress("Préparation de l'aperçu…");
      await loadPreview(data, "");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress("");
    }
  }

  async function changeRally(value: number | "") {
    setRallyId(value);
    if (!payload) return;
    try {
      await loadPreview(payload, value);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function confirm() {
    if (!preview || !championship) return;
    if (!rallyId) {
      setError("Choisissez le rallye du site correspondant à cette épreuve.");
      return;
    }
    setProgress("Enregistrement…");
    setError("");
    try {
      const result = await adminApi.post<{ row_count: number; rally_id: number }>("/imports/racenet", {
        championship_id: championship.id,
        rally_id: rallyId,
        payload,
        resolutions,
        update_dates: updateDates,
      });
      setDone({ rallyId: result.rally_id, count: result.row_count });
      setPreview(null);
      setPayload(null);
      onImported();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress("");
    }
  }

  const overall = showAll.overall ? preview?.overall : preview?.overall.slice(0, TOP);
  const standings = showAll.standings ? preview?.standings : preview?.standings.slice(0, TOP);
  const nameCell = (e: EntryRef) => (
    <>
      {e.name}
      {e.status === "new" && <span className="badge">nouveau</span>}
      {e.status === "renamed" && <span className="badge">pseudo modifié</span>}
    </>
  );

  return (
    <>
      <section className="card">
        <h2>Importer depuis RaceNet{club ? ` · ${club.clubName}` : ""}</h2>
        {!clubId && (
          <p className="alert warn">
            Renseignez l&apos;identifiant du club RaceNet dans les <Link href="/admin/parametres">Paramètres</Link>.
          </p>
        )}
        {events.length > 0 && (
          <>
            <label htmlFor="racenet-event">Épreuve RaceNet</label>
            <div className="row">
              <select id="racenet-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e, i) => {
                  const imported = importedRally(e);
                  return (
                    <option key={e.id} value={e.id} disabled={e.status === 0}>
                      {i + 1}. {e.eventSettings?.location ?? e.id} · {EVENT_STATUS[e.status] ?? "?"}
                      {imported ? " · déjà importé" : ""}
                    </option>
                  );
                })}
              </select>
              <button className="primary" disabled={!!progress || !eventId || !championship} onClick={fetchEvent}>
                Récupérer les résultats
              </button>
            </div>
          </>
        )}
        {progress && <p className="muted">{progress}</p>}
        {error && <p className="alert error">{error}</p>}
        {done && (
          <p className="alert ok">
            Import terminé : {done.count} pilotes classés.{" "}
            <Link href={`/admin/rallyes/${done.rallyId}`}>Voir les résultats</Link> ·{" "}
            <button className="link" onClick={() => window.close()}>
              Fermer cette fenêtre
            </button>
          </p>
        )}
      </section>

      {preview && (
        <section>
          <h2>
            {preview.event.location} · {EVENT_STATUS[preview.event.status]}
          </h2>
          {preview.warnings.map((w) => (
            <p key={w} className="alert warn">
              {w}
            </p>
          ))}

          <div className="card">
            <label htmlFor="racenet-rally">Rallye du site</label>
            <select
              id="racenet-rally"
              value={rallyId}
              onChange={(e) => changeRally(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— choisir —</option>
              {championship?.rallies.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {i + 1}. {r.name} {r.result_count > 0 ? "(déjà importé)" : ""}
                </option>
              ))}
            </select>
            {preview.event.starts_at && (
              <label className="checkbox">
                <input type="checkbox" checked={updateDates} onChange={(e) => setUpdateDates(e.target.checked)} />
                Reprendre les dates RaceNet : {formatRallyDatesLong(preview.event.starts_at, preview.event.ends_at)}
              </label>
            )}
          </div>

          {(preview.drivers.new.length > 0 ||
            preview.drivers.renamed.length > 0 ||
            preview.drivers.anonymous.length > 0 ||
            preview.drivers.attached > 0) && (
            <div className="card">
              <h3>Pilotes</h3>
              {preview.drivers.new.length > 0 && (
                <p>
                  <strong>{preview.drivers.new.length} nouveau(x) :</strong> {preview.drivers.new.join(", ")}
                </p>
              )}
              {preview.drivers.renamed.map((r) => (
                <p key={r.from}>
                  Changement de pseudo : <strong>{r.from}</strong> → <strong>{r.to}</strong>
                </p>
              ))}
              {preview.drivers.attached > 0 && (
                <p className="muted">
                  {preview.drivers.attached} pilote(s) déjà connu(s) reconnu(s) par leur pseudo : ils le seront
                  désormais par leur identifiant RaceNet, même s&apos;ils changent de pseudo.
                </p>
              )}
              {preview.drivers.anonymous.map((a) => (
                <div key={a.racenet_id} className="anonymous-row">
                  <span className="muted">
                    Pilote masqué · {a.vehicle} · {a.platform}
                  </span>
                  <DriverInput
                    value={resolutions[a.racenet_id] ?? ""}
                    onChange={(v) => setResolutions({ ...resolutions, [a.racenet_id]: v })}
                    placeholder="Qui est-ce ? (facultatif)"
                  />
                  {a.suggestions.length > 0 && (
                    <div className="suggestions">
                      {a.suggestions.map((s) => (
                        <button
                          key={s.driver_id}
                          title={s.reason}
                          onClick={() => setResolutions({ ...resolutions, [a.racenet_id]: s.name })}
                        >
                          {s.name} <span className="muted">· {s.reason}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3>Spéciales</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ES</th>
                  <th>Spéciale</th>
                  <th className="num">Km</th>
                  <th>Conditions</th>
                  <th className="num">Pilotes</th>
                  <th>Meilleur temps</th>
                </tr>
              </thead>
              <tbody>
                {preview.stages.map((s) => (
                  <tr key={s.number}>
                    <td className="pos">{s.number}</td>
                    <td>{s.name}</td>
                    <td className="num">{s.distance_km?.toLocaleString("fr-FR") ?? "—"}</td>
                    <td className="muted">{[s.conditions, s.time_of_day].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="num">{s.entrants}</td>
                    <td>{s.winner ? `${s.winner.name} · ${shortTime(s.winner.time)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Classement du rallye · {preview.overall.length} pilotes à l&apos;arrivée</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pilote</th>
                  <th>Voiture</th>
                  <th className="num">Temps</th>
                  <th className="num">Écart</th>
                  <th>Plateforme</th>
                </tr>
              </thead>
              <tbody>
                {overall?.map((r) => (
                  <tr key={r.racenet_id} className={r.status === "anonymous" ? "anonymous" : ""}>
                    <td className="pos">{r.position}</td>
                    <td>{nameCell(r)}</td>
                    <td className="muted">{r.vehicle}</td>
                    <td className="num">{shortTime(r.time)}</td>
                    <td className="num muted">{r.position > 1 ? `+${shortTime(r.diff)}` : ""}</td>
                    <td>
                      <span className="badge">{r.platform}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.overall.length > TOP && (
            <button className="link" onClick={() => setShowAll({ ...showAll, overall: !showAll.overall })}>
              {showAll.overall ? "Réduire" : `Voir les ${preview.overall.length} pilotes`}
            </button>
          )}

          {preview.standings.length > 0 && (
            <>
              <h3>Classement du championnat après ce rallye</h3>
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
                    {standings?.map((r) => (
                      <tr key={r.racenet_id}>
                        <td className="pos">{r.position}</td>
                        <td>{nameCell(r)}</td>
                        <td className="num">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.standings.length > TOP && (
                <button className="link" onClick={() => setShowAll({ ...showAll, standings: !showAll.standings })}>
                  {showAll.standings ? "Réduire" : `Voir les ${preview.standings.length} pilotes`}
                </button>
              )}
            </>
          )}

          <p className="row">
            <button className="primary" disabled={!!progress} onClick={confirm}>
              {progress === "Enregistrement…" ? "Import…" : "Valider l'import"}
            </button>
          </p>
        </section>
      )}
    </>
  );
}
