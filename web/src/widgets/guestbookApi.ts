// API client + types for the guest book widget's backend
// (internal/widgets/guestbook). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Note {
  id: number;
  author: string;
  message: string;
  color: string;
  x: number; // fraction of the wall, -1 = never dragged
  y: number;
  createdAt: string;
}

// Mirrors the server's limit (280 runes, checked in guestbook.handleAdd).
export const MAX_NOTE_LENGTH = 280;

const base = "/api/widgets/guestbook";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const addNote = (author: string, message: string, color: string) =>
  call<Note>("", { method: "POST", body: JSON.stringify({ author, message, color }) });

export const moveNote = (id: number, pos: { x: number; y: number }) =>
  call<void>(`/${id}/position`, { method: "PUT", body: JSON.stringify(pos) });

export const deleteNote = (id: number) => call<void>(`/${id}`, { method: "DELETE" });
