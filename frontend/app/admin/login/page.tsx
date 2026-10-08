"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminApi, errorMessage, setCsrf } from "@/lib/admin-api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const me = await adminApi.post<{ csrf: string }>("/login", {
        username: form.get("username"),
        password: form.get("password"),
      });
      setCsrf(me.csrf);
      router.replace("/admin");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "40px auto" }}>
      <h1>Administration</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="username">Identifiant</label>
        <input id="username" name="username" autoComplete="username" required style={{ width: "100%" }} />
        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={{ width: "100%" }}
        />
        {error && <p className="alert error">{error}</p>}
        <p>
          <button className="primary" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </p>
      </form>
    </main>
  );
}
