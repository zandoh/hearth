// API client + types for the meal plan widget's backend
// (internal/widgets/mealplan). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface MealEntry {
  day: string; // YYYY-MM-DD
  slot: string; // breakfast | lunch | dinner
  text: string;
}

const base = "/api/widgets/mealplan";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const getWeek = (start: string) =>
  call<{ entries: MealEntry[] }>(`/week?start=${encodeURIComponent(start)}`);

export const saveEntry = (entry: MealEntry) =>
  call<void>("/entry", { method: "PUT", body: JSON.stringify(entry) });
