"use client";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";

type Settings = {
  discord_url: string;
  discord_client_id: string;
  discord_client_secret_set: boolean;
  discord_guild_id: string;
  site_url: string;
  racenet_club_id: string;
  discord_redirect_uri: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminApi.get<Settings>("/settings").then(setSettings).catch((e) => setError(errorMessage(e)));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError("");
    setSaved(false);
    try {
      const updated = await adminApi.put<Settings>("/settings", {
        discord_url: settings.discord_url,
        discord_client_id: settings.discord_client_id,
        discord_guild_id: settings.discord_guild_id,
        site_url: settings.site_url,
        racenet_club_id: settings.racenet_club_id,
        // Le secret n'est envoyé que s'il a été saisi (il n'est jamais réaffiché)
        ...(secret ? { discord_client_secret: secret } : {}),
      });
      setSettings(updated);
      setSecret("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!settings) return <p className="muted">{error || "Chargement…"}</p>;
  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings({ ...settings, [key]: e.target.value });
  const loginReady = settings.discord_client_id && settings.discord_client_secret_set;

  return (
    <main>
      <h1>Paramètres du site</h1>
      <form onSubmit={save} style={{ maxWidth: 720 }}>
        <section className="card">
          <h2>Serveur Discord</h2>
          <label htmlFor="discord">Lien d&apos;invitation</label>
          <input
            id="discord"
            type="url"
            value={settings.discord_url}
            onChange={set("discord_url")}
            placeholder="https://discord.gg/…"
            style={{ width: "100%" }}
          />
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Bouton « Rejoindre le Discord » et lien Contact. Vide = masqués.
          </p>
        </section>

        <section className="card">
          <h2>
            Connexion des pilotes avec Discord{" "}
            <span className={`tag ${loginReady ? "championship" : "rally"}`}>{loginReady ? "Active" : "Inactive"}</span>
          </h2>
          <ol className="muted" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              Sur <strong>discord.com/developers/applications</strong> : <em>New Application</em> (nom : eRally4 Cup).
            </li>
            <li>
              Onglet <em>OAuth2</em> : copiez le <strong>Client ID</strong>, puis <em>Reset Secret</em> pour obtenir le{" "}
              <strong>Client Secret</strong>.
            </li>
            <li>
              Toujours dans <em>OAuth2</em>, section <em>Redirects</em> : ajoutez exactement l&apos;adresse ci-dessous.
            </li>
          </ol>

          <label>Adresse de retour à déclarer chez Discord</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input readOnly value={settings.discord_redirect_uri} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => navigator.clipboard.writeText(settings.discord_redirect_uri)}>
              Copier
            </button>
          </div>
          {settings.discord_redirect_uri.startsWith("http://") && !settings.discord_redirect_uri.includes("localhost") && (
            <p className="alert warn">
              L&apos;adresse commence par http:// : renseignez l&apos;adresse du site ci-dessous (https://…).
            </p>
          )}

          <label htmlFor="client_id">Client ID</label>
          <input id="client_id" value={settings.discord_client_id} onChange={set("discord_client_id")} inputMode="numeric" />

          <label htmlFor="client_secret">Client Secret</label>
          <input
            id="client_secret"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={settings.discord_client_secret_set ? "•••••••• (enregistré — laisser vide pour le garder)" : ""}
          />

          <label htmlFor="guild_id">Identifiant du serveur Discord (membres uniquement)</label>
          <input id="guild_id" value={settings.discord_guild_id} onChange={set("discord_guild_id")} inputMode="numeric" />
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Dans Discord : Paramètres utilisateur → Avancés → Mode développeur, puis clic droit sur le serveur → Copier
            l&apos;identifiant. Vide = tout compte Discord peut se connecter.
          </p>

          <label htmlFor="site_url">Adresse du site (facultatif)</label>
          <input
            id="site_url"
            value={settings.site_url}
            onChange={set("site_url")}
            placeholder="https://erally4.devnest.fr"
          />
          <p className="muted" style={{ margin: "6px 0 0" }}>
            À renseigner seulement si l&apos;adresse de retour ci-dessus est incorrecte.
          </p>
        </section>

        <section className="card">
          <h2>Club RaceNet</h2>
          <label htmlFor="racenet_club">Identifiant du club</label>
          <input
            id="racenet_club"
            value={settings.racenet_club_id ?? ""}
            onChange={set("racenet_club_id")}
            inputMode="numeric"
            placeholder="39709"
          />
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Nombre visible dans l&apos;adresse de la page du club sur racenet.com. Utilisé par l&apos;import direct
            depuis RaceNet (page Importer des résultats).
          </p>
        </section>

        {error && <p className="alert error">{error}</p>}
        {saved && <p className="alert ok">Paramètres enregistrés.</p>}
        <p>
          <button className="primary">Enregistrer</button>
        </p>
      </form>
    </main>
  );
}
