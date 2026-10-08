// Appels à l'API depuis le serveur Next.js (composants serveur).
const API_URL = process.env.API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API ${status}`);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}

export type RallySummary = {
  id: number;
  name: string;
  order_index: number;
  event_date: string | null;
  has_results: boolean;
};

export type Championship = {
  id: number;
  name: string;
  mode: "racenet" | "custom";
  rallies: RallySummary[];
};

export type StandingRow = {
  id?: number;
  position: number;
  name: string;
  driver_id: number | null;
  identified: boolean;
  points: number;
  per_rally?: (number | null)[];
};

export type Standings = {
  championship: { id: number; name: string };
  mode: "racenet" | "custom";
  rallies: { id: number; name: string }[];
  unidentified: number;
  standings: StandingRow[];
};

export type RallyResultRow = {
  id: number;
  position: number;
  name: string;
  driver_id: number | null;
  identified: boolean;
  vehicle: string;
  platform: string;
  time: string;
  diff: string;
  points: number | null;
};

export type RallyDetail = {
  id: number;
  name: string;
  event_date: string | null;
  championship: { id: number; name: string; mode: "racenet" | "custom" };
  results: RallyResultRow[];
};

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// "01:08:48.945" -> "1:08:48.945" ; écart "00:00:36.316" -> "+36.316"
export function formatTime(value: string): string {
  return value.replace(/^00:/, "").replace(/^0(\d)/, "$1");
}

export function formatDiff(value: string): string {
  if (/^00:00:00\.000$/.test(value)) return "—";
  return "+" + value.replace(/^00:(00:)?/, "").replace(/^0(\d)/, "$1");
}
