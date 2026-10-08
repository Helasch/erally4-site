"use client";

import { useCallback, useEffect, useState } from "react";

type Check = { url: string; status: string; body: string; ms: number | null };

const URLS = ["/api/hello", "/health"];

export default function TestChecks() {
  const [checks, setChecks] = useState<Check[]>([]);

  const run = useCallback(async () => {
    const results = await Promise.all(
      URLS.map(async (url) => {
        const start = performance.now();
        try {
          const r = await fetch(url, { cache: "no-store" });
          return {
            url,
            status: `${r.status} ${r.ok ? "✅" : "❌"}`,
            body: await r.text(),
            ms: Math.round(performance.now() - start),
          };
        } catch {
          return { url, status: "injoignable ❌", body: "", ms: null };
        }
      }),
    );
    setChecks(results);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <>
      <button onClick={run}>Relancer les tests</button>
      <table style={{ marginTop: 16, borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Route</th>
            <th align="left">Statut</th>
            <th align="left">Temps</th>
            <th align="left">Réponse</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.url} style={{ borderTop: "1px solid #ccc" }}>
              <td><code>{c.url}</code></td>
              <td>{c.status}</td>
              <td>{c.ms !== null ? `${c.ms} ms` : "—"}</td>
              <td><code>{c.body}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
