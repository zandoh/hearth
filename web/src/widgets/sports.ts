// Pure helpers for the sports widget: config parsing and game labels.
// Kept free of React and fetch so bun can table-test them.

import type { Game } from "./sportsApi";

export const LEAGUES = [
  { value: "nfl", label: "NFL" },
  { value: "nhl", label: "NHL" },
  { value: "mlb", label: "MLB" },
  { value: "nba", label: "NBA" },
];

export const DEFAULT_COUNT = 3;
export const MAX_COUNT = 5; // the backend caches this many upcoming games

export interface SportsConfig {
  league: string;
  teamId: string;
  // Denormalized at save time so the card header renders before data lands.
  teamName: string;
  abbrev: string;
  count: number;
}

export function parseSportsConfig(config: Record<string, unknown>): SportsConfig {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let count = typeof config.count === "number" ? Math.round(config.count) : DEFAULT_COUNT;
  if (!Number.isFinite(count)) count = DEFAULT_COUNT;
  return {
    league: str(config.league),
    teamId: str(config.teamId),
    teamName: str(config.teamName),
    abbrev: str(config.abbrev),
    count: Math.min(MAX_COUNT, Math.max(1, count)),
  };
}

// "vs MIA" at home, "@ NYJ" on the road.
export function opponentLabel(g: Pick<Game, "home" | "opponent">): string {
  return `${g.home ? "vs" : "@"} ${g.opponent.abbrev || g.opponent.name}`;
}

export interface GameResult {
  outcome: "W" | "L" | "T";
  score: string; // tracked team's score first, regardless of home/away
}

export function resultLabel(g: Pick<Game, "teamScore" | "oppScore">): GameResult | null {
  if (g.teamScore == null || g.oppScore == null) return null;
  const outcome = g.teamScore > g.oppScore ? "W" : g.teamScore < g.oppScore ? "L" : "T";
  return { outcome, score: `${g.teamScore}–${g.oppScore}` };
}
