import { useSyncExternalStore } from "react";
import { apiFetch } from "./api";

// Guest mode is a per-device state (the wall locks down; phones don't),
// while the PIN and guest view are household settings on the server.

const STORAGE_KEY = "hearth-guest";
const listeners = new Set<() => void>();

export function guestActive(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setGuestActive(on: boolean) {
  if (on) localStorage.setItem(STORAGE_KEY, "1");
  else localStorage.removeItem(STORAGE_KEY);
  for (const l of listeners) l();
}

export function useGuestActive(): boolean {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, guestActive);
}

export interface GuestConfig {
  pinSet: boolean;
  guestViewId: number;
}

export const getGuestConfig = () => apiFetch<GuestConfig>("/api/guest");

export const verifyGuestPin = (pin: string) =>
  apiFetch<{ status: string }>("/api/guest/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });

export const setGuestPin = (pin: string, currentPin: string) =>
  apiFetch<{ status: string }>("/api/guest/pin", {
    method: "POST",
    body: JSON.stringify({ pin, currentPin }),
  });

export const setGuestView = (id: number) =>
  apiFetch<void>(`/api/views/${id}/guest`, { method: "POST" });
