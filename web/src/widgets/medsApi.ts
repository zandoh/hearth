// API client + types for the meds widget's backend
// (internal/widgets/meds). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Dose {
  slot: string;
  taken: boolean;
}

export interface Med {
  id: number;
  name: string;
  person: string; // legacy free text; profileId supersedes it
  profileId?: number;
  times: string[];
  doses: Dose[];
}

const base = "/api/widgets/meds";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const addMed = (name: string, profileId: number, times: string[]) =>
  call<Med>("", { method: "POST", body: JSON.stringify({ name, profileId, times }) });

export const toggleDose = (medId: number, slot: string) =>
  call<void>(`/${medId}/toggle`, { method: "POST", body: JSON.stringify({ slot }) });

export const deleteMed = (id: number) => call<void>(`/${id}`, { method: "DELETE" });
