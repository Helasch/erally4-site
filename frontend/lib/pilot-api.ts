"use client";

// Appels « pilote connecté » depuis le navigateur (cookie de session httpOnly + jeton CSRF).

export type PilotAccount = {
  id: number;
  discord_username: string;
  site_name: string | null;
  racenet_name: string | null;
  link_status: "none" | "pending" | "linked";
  driver_id: number | null;
  vehicle: string | null;
  avatar_url: string | null;
};

let csrf = "";

export class PilotApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-CSRF-Token"] = csrf;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const detail = data?.detail;
    throw new PilotApiError(res.status, typeof detail === "string" ? detail : "Une erreur est survenue, réessayez.");
  }
  return data as T;
}

/** Pilote connecté, ou null. */
export async function fetchMe(): Promise<PilotAccount | null> {
  const me = await call<{ account: PilotAccount; csrf: string } | null>("GET", "/me");
  if (!me) return null;
  csrf = me.csrf;
  return me.account;
}

export const pilotApi = {
  update: (values: Partial<Pick<PilotAccount, "site_name" | "racenet_name" | "vehicle">>) =>
    call<PilotAccount>("PATCH", "/me", values),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<PilotAccount>("POST", "/me/avatar", form);
  },
  removeAvatar: () => call<PilotAccount>("DELETE", "/me/avatar"),
  deleteAccount: () => call<{ ok: boolean }>("DELETE", "/me"),
  logout: () => call<{ ok: boolean }>("POST", "/auth/logout"),
  vehicles: () => call<string[]>("GET", "/vehicles"),
};

export function loginUrl(next = "/mon-compte") {
  return `/api/auth/discord/login?next=${encodeURIComponent(next)}`;
}
