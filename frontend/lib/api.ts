import type { RallyStatus } from "./format";
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
  starts_at: string | null;
  ends_at: string | null;
  status: RallyStatus;
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
    return await apiGet<Championship | null>(path);
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
  evol?: number | null;
  gained?: number | null;
  is_new?: boolean;
  adjustment?: number;
  adjustment_reasons?: string[];
};

export type Standings = {
  championship: { id: number; name: string };
  mode: "racenet" | "custom";
  rallies: { id: number; name: string; round: number }[];
  /** Rallyes après lesquels un classement existe */
  snapshots: { id: number; name: string; round: number }[];
  /** Classement affiché : après ce rallye (null : ancien import sans rallye) */
  after: { id: number; name: string; round: number } | null;
  previous: { id: number; name: string; round: number } | null;
  unidentified: number;
  standings: StandingRow[];
};

export type RallyResultRow = {
  id: number;
  /** null = non classé (pénalité) */
  position: number | null;
  name: string;
  driver_id: number | null;
  identified: boolean;
  vehicle: string;
  platform: string;
  time: string;
  diff: string | null;
  diff_prev: string | null;
  points: number | null;
  penalty_s: number;
  disqualified: boolean;
  penalty_reason: string | null;
};

export type RallyDetail = {
  id: number;
  round: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: RallyStatus;
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
    | (RallyRef & { starts_at: string | null; ends_at: string | null; podium: PodiumEntry[]; top5: PodiumEntry[]; result_count: number })
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

export type DriverListItem = {
  id: number;
  name: string;
  avatar_url: string | null;
  position: number | null;
  points: number | null;
  rallies: number;
  wins: number;
  podiums: number;
  best: number | null;
  platform: string | null;
  vehicle: string | null;
};

export type DriverStats = {
  rallies: number;
  wins: number;
  podiums: number;
  top10: number;
  best: number | null;
  average_position: number | null;
  average_gap_ms: number | null;
};

export type DriverProfile = {
  id: number;
  name: string;
  racenet_name: string | null;
  avatar_url: string | null;
  has_account: boolean;
  platform: string | null;
  vehicle: string | null;
  career: DriverStats;
  season: {
    championship: { id: number; name: string; mode: "racenet" | "custom" };
    position: number | null;
    points: number | null;
    adjustment_reasons: string[];
    classified: number;
    stats: DriverStats;
    progression: { round: number; rally: string; position: number; points: number; classified: number }[];
    history: {
      rally_id: number;
      round: number;
      rally: string;
      starts_at: string | null;
      ends_at: string | null;
      /** null = non classé (pénalité) */
      position: number | null;
      finishers: number;
      time: string;
      diff: string | null;
      vehicle: string;
      platform: string;
      points: number | null;
      penalty_s: number;
      disqualified: boolean;
      penalty_reason: string | null;
    }[];
  } | null;
};

/** Écart en millisecondes -> "+1:23.456" */
export function formatGapMs(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `+${minutes}:${seconds}`;
}
