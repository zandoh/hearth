// API client + types for the sports widget's backend
// (internal/widgets/sports). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Team {
  id: string;
  name: string;
  abbrev: string;
  logo?: string;
  record?: string;
}

export type GameStatus = "scheduled" | "live" | "final";

export interface Game {
  id: string;
  start: string; // UTC; render in the device's local zone
  status: GameStatus;
  home: boolean;
  opponent: Team;
  teamScore?: number;
  oppScore?: number;
  detail?: string;
  broadcast?: string;
}

export interface TeamGames {
  league: string;
  team: Team;
  fetchedAt: string;
  previous?: Game;
  live?: Game;
  upcoming: Game[];
}

// {pending:true} until the backend's first fetch for this team lands; the
// completed fetch announces itself on the sports SSE topic.
export interface GamesResponse {
  pending?: boolean;
  games?: TeamGames;
}

const base = "/api/widgets/sports";

const call = <T>(path: string) => apiFetch<T>(base + path);

export const getTeams = (league: string) =>
  call<Team[]>(`/teams?league=${encodeURIComponent(league)}`);

export const getGames = (league: string, teamId: string) =>
  call<GamesResponse>(
    `/games?league=${encodeURIComponent(league)}&team=${encodeURIComponent(teamId)}`,
  );
