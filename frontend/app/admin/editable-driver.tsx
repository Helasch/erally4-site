"use client";

import { useState } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { DriverInput } from "./driver-input";

// Nom de pilote modifiable sur une ligne de résultat (endpoint = /rally-results/:id ou /racenet-standings/:id)
export function EditableDriver({
  endpoint,
  name,
  identified,
  onSaved,
}: {
  endpoint: string;
  name: string;
  identified: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(identified ? name : "");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await adminApi.patch(endpoint, { driver_name: value.trim() || null });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!editing) {
    return (
      <span className="row" style={{ gap: 4 }}>
        {identified ? name : <em>{name} (non identifié)</em>}
        <button className="link" onClick={() => setEditing(true)}>
          Modifier
        </button>
      </span>
    );
  }

  return (
    <span className="row" style={{ gap: 4 }}>
      <DriverInput value={value} onChange={setValue} />
      <button className="primary" onClick={save}>
        OK
      </button>
      <button onClick={() => setEditing(false)}>Annuler</button>
      {error && <span className="alert error">{error}</span>}
    </span>
  );
}
