// API client + types for the grocery widget's backend
// (internal/widgets/grocery). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface GroceryItem {
  id: number;
  name: string;
  checked: boolean;
}

const base = "/api/widgets/grocery";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const addItem = (name: string) =>
  call<GroceryItem>("", { method: "POST", body: JSON.stringify({ name }) });

export const toggleItem = (id: number) => call<void>(`/${id}/toggle`, { method: "POST" });

export const clearChecked = () => call<void>("/clear-checked", { method: "POST" });
