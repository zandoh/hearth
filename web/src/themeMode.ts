import { useSyncExternalStore } from "react";

// Manual theme mode with per-device persistence: the wall kiosk can be
// pinned dark while a laptop follows the OS.
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "hearth-theme-mode";
const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  for (const l of listeners) l();
}

export const nextThemeMode = (mode: ThemeMode): ThemeMode =>
  mode === "system" ? "dark" : mode === "dark" ? "light" : "system";

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getThemeMode);
}
