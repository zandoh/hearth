import { isDemo } from "./demo";
import { demoFetch } from "./demo/api";
import type { LayoutItem, View } from "./types";

/**
 * The one fetch convention for the whole app: JSON in/out, and on failure
 * the server's {"error": "..."} body becomes the Error message so callers
 * can show it instead of a bare status code.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Demo builds route every call to the in-browser backend; there is no
  // server behind GitHub Pages.
  const res = isDemo
    ? await demoFetch(path, init)
    : await fetch(path, {
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

export const setViewHidden = (id: number, hidden: boolean) =>
  apiFetch<void>(`/api/views/${id}/hidden`, {
    method: "PUT",
    body: JSON.stringify({ hidden }),
  });

export const reorderViews = (ids: number[]) =>
  apiFetch<void>("/api/views/order", { method: "PUT", body: JSON.stringify({ ids }) });

export const setViewSchedule = (id: number, start: string, end: string) =>
  apiFetch<void>(`/api/views/${id}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ start, end }),
  });

export const setDefaultView = (id: number) =>
  apiFetch<void>(`/api/views/${id}/default`, { method: "POST" });

// The layout transfer document (internal/server/transfer.go is the source
// of truth): views minus the fields that don't travel (id, isDefault).
export interface TransferView {
  name: string;
  layout: LayoutItem[];
  hidden?: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
}

export interface ViewsExport {
  hearthViews: number;
  exportedAt: string;
  views: TransferView[];
}

export const exportViews = () => apiFetch<ViewsExport>("/api/views/export");

export const importViews = (doc: ViewsExport) =>
  apiFetch<{ imported: View[] }>("/api/views/import", {
    method: "POST",
    body: JSON.stringify(doc),
  });
