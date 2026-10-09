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

// --- Dates et statut des rallyes -------------------------------------------------------
// Les dates arrivent sans fuseau ("2026-03-12T20:00:00") et sont déjà en heure de Paris :
// on les lit et on les affiche telles quelles (UTC des deux côtés), sans conversion.

export type RallyStatus = "done" | "done_pending" | "live" | "next" | "upcoming";

function parseLocal(value: string): Date {
  const [d, t = "00:00"] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, day, h, min));
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", ...opts });
const dayMonth = fmt({ day: "numeric", month: "short" });
const dayMonthYear = fmt({ day: "numeric", month: "short", year: "numeric" });
const weekdayDayMonth = fmt({ weekday: "short", day: "numeric", month: "short" });
const time = fmt({ hour: "2-digit", minute: "2-digit" });

const isWholeDay = (s: Date, e: Date) =>
  s.getUTCHours() === 0 && s.getUTCMinutes() === 0 && e.getUTCHours() === 23 && e.getUTCMinutes() === 59;

/** Plage courte : « 12 – 15 févr. 2026 », « 8 sept. 2026 » ; null si pas de date. */
export function formatRallyDates(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null;
  const s = parseLocal(startsAt);
  const e = endsAt ? parseLocal(endsAt) : s;
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  if (sameDay) return dayMonthYear.format(s);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${s.getUTCDate()} – ${dayMonthYear.format(e)}`
    : `${dayMonth.format(s)} – ${dayMonthYear.format(e)}`;
}

/** Plage détaillée avec heures : « du jeu. 12 févr. 20:00 au dim. 15 févr. 23:59 ». */
export function formatRallyDatesLong(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null;
  const s = parseLocal(startsAt);
  if (!endsAt) return `à partir du ${weekdayDayMonth.format(s)} à ${time.format(s)}`;
  const e = parseLocal(endsAt);
  if (isWholeDay(s, e)) return formatRallyDates(startsAt, endsAt);
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  return sameDay
    ? `le ${weekdayDayMonth.format(s)}, de ${time.format(s)} à ${time.format(e)}`
    : `du ${weekdayDayMonth.format(s)} ${time.format(s)} au ${weekdayDayMonth.format(e)} ${time.format(e)}`;
}

export function statusLabel(status: RallyStatus): { text: string; kind: string } {
  switch (status) {
    case "done":
      return { text: "Terminé", kind: "done" };
    case "done_pending":
      return { text: "Terminé · résultats à venir", kind: "done-pending" };
    case "live":
      return { text: "En cours", kind: "live" };
    case "next":
      return { text: "Prochain", kind: "next" };
    default:
      return { text: "À venir", kind: "todo" };
  }
}

// --- Spéciales (libellés RaceNet en anglais, traduits quand on les connaît) ----------

const WEATHER: Record<string, string> = {
  clear: "Dégagé",
  sunny: "Ensoleillé",
  overcast: "Couvert",
  cloudy: "Nuageux",
  "light cloud": "Peu nuageux",
  "heavy cloud": "Très nuageux",
  rain: "Pluie",
  "light rain": "Pluie fine",
  "heavy rain": "Forte pluie",
  fog: "Brouillard",
  foggy: "Brouillard",
  snow: "Neige",
  "light snow": "Neige légère",
  "heavy snow": "Forte neige",
  storm: "Orage",
};

const SURFACE: Record<string, string> = {
  dry: "sec",
  damp: "humide",
  wet: "mouillé",
  ice: "verglas",
  icy: "verglas",
  snow: "neige",
  mud: "boue",
  flooded: "inondé",
};

const TIME_OF_DAY: Record<string, string> = {
  night: "Nuit",
  day: "Jour",
  morning: "Matin",
  midday: "Midi",
  afternoon: "Après-midi",
  evening: "Soir",
  dusk: "Crépuscule",
  dawn: "Aube",
  sunrise: "Lever du soleil",
  sunset: "Coucher du soleil",
};

const translate = (table: Record<string, string>, value: string) => table[value.trim().toLowerCase()] ?? value.trim();

/** « Overcast (Ice) » + « Night » → « Couvert · verglas · Nuit » */
export function stageConditions(conditions: string | null, timeOfDay: string | null): string {
  const parts: string[] = [];
  if (conditions) {
    const match = conditions.match(/^(.*?)\s*\((.*)\)\s*$/);
    if (match) parts.push(translate(WEATHER, match[1]), translate(SURFACE, match[2]));
    else parts.push(translate(WEATHER, conditions));
  }
  if (timeOfDay) parts.push(translate(TIME_OF_DAY, timeOfDay));
  return parts.join(" · ");
}

/** 18.5 → « 18,5 km » */
export function formatKm(km: number | null): string | null {
  return km === null ? null : `${km.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km`;
}
