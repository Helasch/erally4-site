"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "./pilot-api";

/** Pilote relié au compte connecté (null : visiteur, ou compte pas encore relié à un pilote). */
export function useMyDriverId(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((me) => alive && setId(me?.driver_id ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return id;
}
