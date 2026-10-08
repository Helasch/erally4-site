"use client";

import type { RallyStatus } from "./format";

// Appels à l'API admin depuis le navigateur (même origine, cookie de session httpOnly).
// Toute requête qui modifie quelque chose envoie le jeton CSRF de la session.

let csrfToken = "";

export function setCsrf(token: string) {
  csrfToken = token;
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: { line?: number | null; column?: string | null; existing_id?: number },
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api/admin${path}`, { method, headers, body: payload, credentials: "same-origin" });
  if (res.status === 401 && !path.startsWith("/login") && !path.startsWith("/me")) {
    window.location.href = "/admin/login";
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? (Array.isArray(detail) ? "Données invalides." : `Erreur ${res.status}`);
    throw new AdminApiError(res.status, message, typeof detail === "object" ? detail : undefined);
  }
  return data as T;
}

export const adminApi = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T,>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T,>(path: string) => request<T>("DELETE", path),
};

export type AdminRally = {
  id: number;
  name: string;
  order_index: number;
  starts_at: string | null;
  ends_at: string | null;
  status: RallyStatus;
  result_count: number;
  unidentified: number;
};

export type AdminChampionship = {
  id: number;
  name: string;
  is_current: boolean;
  mode: "racenet" | "custom";
  scoring: number[];
  rallies: AdminRally[];
};

export type Driver = { id: number; name: string };

export function errorMessage(e: unknown): string {
  if (e instanceof AdminApiError) {
    const where = [e.detail?.line && `ligne ${e.detail.line}`, e.detail?.column && `colonne « ${e.detail.column} »`]
      .filter(Boolean)
      .join(", ");
    return where && !e.message.includes("ligne") ? `${where} : ${e.message}` : e.message;
  }
  return "Erreur réseau, réessayez.";
}
