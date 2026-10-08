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

/** Initiales pour l'avatar par défaut : "Gabriel_44_16" -> "GA", "XsgDredre" -> "XD" */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-zÀ-ÿ0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const caps = name.match(/[A-Z]/g) ?? [];
  if (parts.length >= 2 && /[A-Za-z]/.test(parts[1][0])) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Teinte stable par pilote pour l'avatar par défaut (dans les rouges / bruns de la charte). */
export function avatarHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return [350, 0, 10, 20, 340, 15][h % 6];
}

/** 1 -> "1er", 2 -> "2e" */
export function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}e`;
}

/** "Peugeot 208 Rally4" -> "peugeot-208-rally4" (nom du fichier image dans public/cars) */
export function carSlug(vehicle: string): string {
  return vehicle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
