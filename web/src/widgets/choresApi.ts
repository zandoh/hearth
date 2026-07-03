// API client + types for the chores widget's backend
// (internal/widgets/chores). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Chore {
  id: number;
  title: string;
  everyDays: number; // 0 = one-off: done once, then gone
  lastDone?: string;
  assigneeId?: number;
  dueOn: string;
  dueIn: number; // negative = overdue
  neverDone: boolean;
  oneOff: boolean;
}

const base = "/api/widgets/chores";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const addChore = (title: string, everyDays: number, assigneeId: number) =>
  call<Chore>("", { method: "POST", body: JSON.stringify({ title, everyDays, assigneeId }) });

export const completeChore = (id: number) => call<void>(`/${id}/complete`, { method: "POST" });

export const deleteChore = (id: number) => call<void>(`/${id}`, { method: "DELETE" });
