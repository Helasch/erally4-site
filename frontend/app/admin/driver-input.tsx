"use client";

import type { Driver } from "@/lib/admin-api";

// Liste des pilotes connus, partagée par tous les champs de saisie de la page
export function DriverDatalist({ drivers }: { drivers: Driver[] }) {
  return (
    <datalist id="known-drivers">
      {drivers.map((d) => (
        <option key={d.id} value={d.name} />
      ))}
    </datalist>
  );
}

export function DriverInput({
  value,
  onChange,
  placeholder = "Pseudo du pilote",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      list="known-drivers"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={64}
      style={{ minWidth: 180 }}
    />
  );
}
