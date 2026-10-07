"use client";

import { useEffect, useState } from "react";

// Vérifie que la chaîne navigateur → Next.js → FastAPI fonctionne.
export default function ApiStatus() {
  const [message, setMessage] = useState("Connexion à l'API…");

  useEffect(() => {
    fetch("/api/hello")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("API injoignable"));
  }, []);

  return <p>{message}</p>;
}
