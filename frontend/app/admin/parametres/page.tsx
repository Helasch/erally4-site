"use client";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";

type Settings = { discord_url: string };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
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
      setSettings(await adminApi.put<Settings>("/settings", settings));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!settings) return <p className="muted">{error || "Chargement…"}</p>;

  return (
    <main>
      <h1>Paramètres du site</h1>
      <form className="card" onSubmit={save} style={{ maxWidth: 640 }}>
        <label htmlFor="discord">Lien d&apos;invitation Discord</label>
        <input
          id="discord"
          type="url"
          value={settings.discord_url}
          onChange={(e) => setSettings({ ...settings, discord_url: e.target.value })}
          placeholder="https://discord.gg/…"
          style={{ width: "100%" }}
        />
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Affiche le bouton « Rejoindre le Discord » sur le site. Laissez vide pour le masquer.
        </p>
        {error && <p className="alert error">{error}</p>}
        {saved && <p className="alert ok">Paramètres enregistrés.</p>}
        <p>
          <button className="primary">Enregistrer</button>
        </p>
      </form>
    </main>
  );
}
