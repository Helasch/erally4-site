"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DriverListItem } from "@/lib/api";
import { ordinal } from "@/lib/format";
import Avatar from "../avatar";

export default function DriverGrid({ drivers }: { drivers: DriverListItem[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? drivers.filter((d) => d.name.toLowerCase().includes(q)) : drivers), [drivers, q]);

  return (
    <>
      <label className="search">
        <span className="visually-hidden">Rechercher un pilote</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un pilote…" />
      </label>
      {shown.length === 0 ? (
        <p className="empty">Aucun pilote ne correspond à cette recherche.</p>
      ) : (
        <ul className="driver-grid">
          {shown.map((d) => (
            <li key={d.id}>
              <Link href={`/pilotes/${d.id}`} className="driver-card">
                <Avatar name={d.name} url={d.avatar_url} size={52} />
                <span className="driver-card-body">
                  <span className="driver-card-name">{d.name}</span>
                  <small>{[d.platform, d.vehicle].filter(Boolean).join(" · ") || "—"}</small>
                </span>
                <span className="driver-card-rank">
                  {d.position !== null ? (
                    <>
                      <b>{ordinal(d.position)}</b>
                      <small>{d.points} pts</small>
                    </>
                  ) : (
                    <small>Non classé</small>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
