"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchMe, pilotApi, PilotApiError, type PilotAccount } from "@/lib/pilot-api";
import Avatar from "../avatar";
import CarVisual from "../car-visual";
import PageHeader from "../page-header";

const LINK_LABELS: Record<PilotAccount["link_status"], { text: string; kind: string }> = {
  linked: { text: "Relié à vos résultats", kind: "ok" },
  pending: { text: "En attente de validation par l'admin", kind: "warn" },
  none: { text: "Non relié : indiquez votre pseudo RaceNet", kind: "muted" },
};

function errorText(e: unknown) {
  return e instanceof PilotApiError ? e.message : "Une erreur est survenue, réessayez.";
}

export default function MonComptePage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<PilotAccount | null>(null);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [form, setForm] = useState({ site_name: "", racenet_name: "", vehicle: "" });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((account) => {
        if (!account) {
          router.replace("/connexion?next=/mon-compte");
          return;
        }
        setMe(account);
        setForm({
          site_name: account.site_name ?? "",
          racenet_name: account.racenet_name ?? "",
          vehicle: account.vehicle ?? "",
        });
      })
      .catch(() => setMessage({ kind: "error", text: "Impossible de charger votre compte." }));
    pilotApi.vehicles().then(setVehicles).catch(() => {});
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const account = await pilotApi.update({
        site_name: form.site_name,
        racenet_name: form.racenet_name,
        vehicle: form.vehicle,
      });
      setMe(account);
      setMessage({
        kind: "ok",
        text:
          account.link_status === "pending"
            ? "Profil enregistré. Votre pseudo RaceNet n'a pas été trouvé automatiquement : l'admin va faire la liaison."
            : "Profil enregistré.",
      });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      setMe(await pilotApi.uploadAvatar(file));
      setMessage({ kind: "ok", text: "Photo mise à jour." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto() {
    setBusy(true);
    try {
      setMe(await pilotApi.removeAvatar());
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Supprimer définitivement votre compte ? Votre photo et vos réglages seront effacés. Vos résultats restent affichés sous votre pseudo RaceNet.",
      )
    )
      return;
    await pilotApi.deleteAccount().catch(() => {});
    window.location.href = "/";
  }

  if (!me) {
    return (
      <>
        <PageHeader title="Mon compte" />
        <section className="band band-grey">
          <div className="band-inner narrow">
            <p className="empty">{message?.text ?? "Chargement…"}</p>
          </div>
        </section>
      </>
    );
  }

  const displayName = me.site_name || me.discord_username;
  const link = LINK_LABELS[me.link_status];

  return (
    <>
      <PageHeader
        title="Mon compte"
        subtitle={`Connecté avec Discord : ${me.discord_username}`}
        visual={<CarVisual vehicle={me.vehicle} />}
      >
        <div className="driver-head">
          <Avatar name={displayName} url={me.avatar_url} size={72} />
          <div className="driver-tags">
            <span className={`tag-light tag-${link.kind}`}>{link.text}</span>
            {me.driver_id !== null && (
              <Link href={`/pilotes/${me.driver_id}`} className="tag-light tag-link">
                Voir mon profil pilote →
              </Link>
            )}
          </div>
        </div>
      </PageHeader>

      <section className="band band-grey">
        <div className="band-inner narrow">
          {!me.site_name && (
            <p className="notice">
              Bienvenue ! Choisissez votre pseudo et indiquez votre pseudo RaceNet pour être relié à vos résultats.
            </p>
          )}
          {message && <p className={`notice ${message.kind === "error" ? "notice-error" : "notice-ok"}`}>{message.text}</p>}

          <form className="card-block account-form" onSubmit={save}>
            <h2>Profil</h2>

            <label htmlFor="site_name">Pseudo sur le site</label>
            <input
              id="site_name"
              value={form.site_name}
              onChange={(e) => setForm({ ...form, site_name: e.target.value })}
              minLength={3}
              maxLength={32}
              required
              placeholder="Le nom affiché dans les classements"
            />
            <p className="hint">3 à 32 caractères. Il remplace votre pseudo RaceNet dans les classements.</p>

            <label htmlFor="racenet_name">Pseudo RaceNet</label>
            <input
              id="racenet_name"
              value={form.racenet_name}
              onChange={(e) => setForm({ ...form, racenet_name: e.target.value })}
              maxLength={64}
              placeholder="Exactement comme dans EA SPORTS WRC"
            />
            <p className="hint">
              Sert à vous relier à vos résultats. Si RaceNet vous affiche en « WRC Player », indiquez quand même votre
              vrai pseudo : l&apos;admin fera la liaison.
            </p>

            <label htmlFor="vehicle">Voiture du championnat</label>
            <select id="vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
              <option value="">— Choisir —</option>
              {vehicles.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <button className="btn btn-red" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>

          <div className="card-block account-form">
            <h2>Photo de profil</h2>
            <div className="photo-row">
              <Avatar name={displayName} url={me.avatar_url} size={96} />
              <div>
                <p className="hint">JPEG, PNG ou WebP, 5 Mo maximum. Elle sera recadrée en carré.</p>
                <div className="photo-actions">
                  <button type="button" className="btn btn-dark" disabled={busy} onClick={() => fileInput.current?.click()}>
                    {me.avatar_url ? "Changer la photo" : "Ajouter une photo"}
                  </button>
                  {me.avatar_url && (
                    <button type="button" className="btn-text" disabled={busy} onClick={removePhoto}>
                      Retirer
                    </button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </div>
            </div>
          </div>

          <div className="card-block account-form danger-zone">
            <h2>Supprimer mon compte</h2>
            <p className="hint">
              Efface votre compte, votre photo et vos réglages. Vos résultats restent dans les classements sous votre
              pseudo RaceNet.
            </p>
            <button type="button" className="btn-text danger" onClick={deleteAccount}>
              Supprimer définitivement mon compte
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
