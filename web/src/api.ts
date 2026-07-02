import type { LayoutItem, Profile, View } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getViews = () => api<View[]>("/api/views");

export const createView = (name: string, layout: LayoutItem[]) =>
  api<View>("/api/views", { method: "POST", body: JSON.stringify({ name, layout }) });

export const updateView = (id: number, name: string, layout: LayoutItem[]) =>
  api<View>(`/api/views/${id}`, { method: "PUT", body: JSON.stringify({ name, layout }) });

export const deleteView = (id: number) => api<void>(`/api/views/${id}`, { method: "DELETE" });

export const getProfiles = () => api<Profile[]>("/api/profiles");
