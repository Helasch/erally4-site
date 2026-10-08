"use client";

import { useState } from "react";
import { carSlug } from "@/lib/format";

// Voiture détourée affichée dans le bandeau sombre ; masquée si l'image n'existe pas
export default function CarVisual({ vehicle }: { vehicle: string | null }) {
  const [missing, setMissing] = useState(false);
  if (!vehicle || missing) return null;
  return (
    <div className="head-visual" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- image statique déjà optimisée */}
      <img src={`/cars/${carSlug(vehicle)}.webp`} alt="" onError={() => setMissing(true)} />
    </div>
  );
}
