import type { LayoutItem, View } from "./types";

/**
 * The one fetch convention for the whole app: JSON in/out, and on failure
 * the server's {"error": "..."} body becomes the Error message so callers
 * can show it instead of a bare status code.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `${init?.method ?? "GET"} ${path}: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getViews = () => apiFetch<View[]>("/api/views");

export const createView = (name: string, layout: LayoutItem[]) =>
  apiFetch<View>("/api/views", { method: "POST", body: JSON.stringify({ name, layout }) });

export const updateView = (id: number, name: string, layout: LayoutItem[]) =>
  apiFetch<View>(`/api/views/${id}`, { method: "PUT", body: JSON.stringify({ name, layout }) });

export const deleteView = (id: number) => apiFetch<void>(`/api/views/${id}`, { method: "DELETE" });

export const setDefaultView = (id: number) =>
  apiFetch<void>(`/api/views/${id}/default`, { method: "POST" });
