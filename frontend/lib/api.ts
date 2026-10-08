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
  round: number;
  name: string;
  order_index: number;
  event_date: string | null;
  has_results: boolean;
  result_count: number;
  winner: { name: string; platform: string } | null;
};

export type Championship = {
  id: number;
  name: string;
  is_current: boolean;
  mode: "racenet" | "custom";
  rallies: RallySummary[];
};

export type ChampionshipListItem = { id: number; name: string; is_current: boolean };

/** Championnat demandé par ?saison=, sinon celui en cours (null s'il n'y en a aucun). */
export async function loadChampionship(saison: string | undefined): Promise<Championship | null> {
  const path = saison && /^\d+$/.test(saison) ? `/api/championships/${saison}` : "/api/championship/current";
  try {
    return await apiGet<Championship>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

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
  diff_prev: string;
  points: number | null;
};

export type RallyDetail = {
  id: number;
  round: number;
  name: string;
  event_date: string | null;
  championship: { id: number; name: string; mode: "racenet" | "custom" };
  rallies: RallySummary[];
  results: RallyResultRow[];
};

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// "01:08:48.945" -> "1:08:48.945" ; "00:34:27.583" -> "34:27.583" ; "00:00:26.347" -> "0:26.347"
export function formatTime(value: string): string {
  return value.replace(/^00:/, "").replace(/^0(\d)/, "$1");
}

// Écart au premier : "00:00:26.347" -> "+0:26.347" ; premier -> "—"
export function formatDiff(value: string): string {
  if (/^00:00:00\.000$/.test(value)) return "—";
  return "+" + formatTime(value);
}

export type RallyRef = { id: number; name: string; round: number };

export type PodiumEntry = {
  position: number;
  name: string;
  driver_id: number | null;
  vehicle: string;
  platform: string;
  time: string;
  diff: string;
};

export type StandingEntry = {
  id?: number;
  position: number;
  name: string;
  driver_id: number | null;
  identified: boolean;
  points: number;
  evol: number | null;
  gained: number | null;
  is_new: boolean;
  per_rally?: (number | null)[];
};

export type Home = {
  championship: { id: number; name: string; mode: "racenet" | "custom" };
  total_rounds: number;
  completed_rounds: number;
  last_rally:
    | (RallyRef & { event_date: string | null; podium: PodiumEntry[]; top5: PodiumEntry[]; result_count: number })
    | null;
  standings: {
    after: RallyRef | null;
    count: number;
    top5: StandingEntry[];
    leader: {
      name: string;
      driver_id: number | null;
      points: number;
      wins: number;
      gap: number | null;
      was_leader: boolean;
    } | null;
  };
  calendar: RallySummary[];
};
