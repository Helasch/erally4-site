"use client";

import { useRouter } from "next/navigation";

// Liste déroulante qui navigue vers l'URL de l'option choisie (choix de la saison, du rallye…)
export default function NavSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: { href: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <label className="pill-select">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => router.push(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
