import { apiFetch } from "./api";

// Night dimming config lives on the server (settings table) so every
// device on the wall dims together. See internal/server/night.go.
export interface NightConfig {
  enabled: boolean;
  start: string; // HH:MM local
  end: string; // HH:MM local, may cross midnight
  level: number; // shade opacity, 0.2–0.85
}

export const getNightConfig = () => apiFetch<NightConfig>("/api/night");

export const setNightConfig = (cfg: NightConfig) =>
  apiFetch<NightConfig>("/api/night", { method: "PUT", body: JSON.stringify(cfg) });
