// Mise en forme partagée par les pages publiques (rendu serveur et client).

/** "Rallye de Pologne" -> "Pologne" ; "Rallye Monte-Carlo" -> "Monte-Carlo" */
export function shortRallyName(name: string): string {
  const short = name.replace(/^rall(y|ye)\s+(de\s+la\s+|de\s+l['’]\s*|des\s+|du\s+|de\s+|d['’]\s*)?/i, "").trim();
  return short || name;
}

export type Movement = { evol: number | null; is_new: boolean };

/** Évolution au classement : ▲ 3 (gagné), ▼ 1 (perdu), – (stable ou inconnu), « Nouveau ». */
export function movementLabel(m: Movement): { text: string; kind: "up" | "down" | "same" | "new" } {
  if (m.is_new) return { text: "Nouveau", kind: "new" };
  if (m.evol === null || m.evol === 0) return { text: "–", kind: "same" };
  return m.evol > 0 ? { text: `▲ ${m.evol}`, kind: "up" } : { text: `▼ ${-m.evol}`, kind: "down" };
}

export function plural(n: number, singular: string, pluralForm = singular + "s"): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}
