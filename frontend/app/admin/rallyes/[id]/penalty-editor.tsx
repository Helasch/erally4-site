"use client";

import { useState } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";
import type { RallyResultRow } from "@/lib/api";

type Kind = "none" | "time" | "dsq";

// Pénalité d'un résultat (article 8) : temps ajouté ou « non classé », avec motif obligatoire
export function PenaltyEditor({ result: r, onSaved }: { result: RallyResultRow; onSaved: () => void }) {
  const initial: Kind = r.disqualified ? "dsq" : r.penalty_s ? "time" : "none";
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<Kind>(initial);
  const [seconds, setSeconds] = useState(r.penalty_s ? String(r.penalty_s) : "");
  const [reason, setReason] = useState(r.penalty_reason ?? "");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await adminApi.patch(`/rally-results/${r.id}/penalty`, {
        penalty_s: kind === "time" ? Number(seconds.replace(",", ".")) || 0 : 0,
        disqualified: kind === "dsq",
        reason: kind === "none" ? null : reason,
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!editing) {
    return (
      <span className="row" style={{ gap: 6 }}>
        {r.disqualified ? (
          <span className="tag status-live" title={r.penalty_reason ?? ""}>
            Non classé
          </span>
        ) : r.penalty_s ? (
          <span className="tag status-next" title={r.penalty_reason ?? ""}>
            +{r.penalty_s} s
          </span>
        ) : null}
        {r.penalty_reason && <span className="muted">{r.penalty_reason}</span>}
        <button className="link" onClick={() => setEditing(true)}>
          {initial === "none" ? "Pénaliser" : "Modifier"}
        </button>
      </span>
    );
  }

  return (
    <div className="penalty-form">
      <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Type de pénalité">
        <option value="none">Aucune pénalité</option>
        <option value="time">Pénalité de temps</option>
        <option value="dsq">Non classé (disqualification)</option>
      </select>
      {kind === "time" && (
        <input
          inputMode="decimal"
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          placeholder="Secondes (ex. 10)"
          aria-label="Secondes de pénalité"
          style={{ width: 130 }}
        />
      )}
      {kind !== "none" && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif (ex. coupe de route ES3)"
          maxLength={255}
          aria-label="Motif"
          style={{ minWidth: 220 }}
        />
      )}
      <button className="primary" onClick={save}>
        OK
      </button>
      <button onClick={() => setEditing(false)}>Annuler</button>
      {error && <span className="alert error">{error}</span>}
    </div>
  );
}
