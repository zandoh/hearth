// The sports widget's backend, sandbox edition: fixed rosters per league
// and schedules synthesized from a hash of the team, so every visitor sees
// plausible games that stay stable across renders — no ESPN calls. Logos
// come off ESPN's CDN like the real backend's; TeamLogo hides them if the
// kiosk (here, the visitor's browser) can't load them.

import type { Game, GamesResponse, Team } from "../widgets/sportsApi";

// [id (doubles as the ESPN logo slug), display abbrev, name]
type Row = [string, string, string];

const ROSTERS: Record<string, Row[]> = {
  nfl: [
    ["buf", "BUF", "Buffalo Bills"],
    ["dal", "DAL", "Dallas Cowboys"],
    ["det", "DET", "Detroit Lions"],
    ["gb", "GB", "Green Bay Packers"],
    ["kc", "KC", "Kansas City Chiefs"],
    ["ne", "NE", "New England Patriots"],
    ["phi", "PHI", "Philadelphia Eagles"],
    ["sf", "SF", "San Francisco 49ers"],
  ],
  nhl: [
    ["bos", "BOS", "Boston Bruins"],
    ["chi", "CHI", "Chicago Blackhawks"],
    ["col", "COL", "Colorado Avalanche"],
    ["det", "DET", "Detroit Red Wings"],
    ["edm", "EDM", "Edmonton Oilers"],
    ["fla", "FLA", "Florida Panthers"],
    ["nyr", "NYR", "New York Rangers"],
    ["tor", "TOR", "Toronto Maple Leafs"],
  ],
  mlb: [
    ["atl", "ATL", "Atlanta Braves"],
    ["bos", "BOS", "Boston Red Sox"],
    ["chc", "CHC", "Chicago Cubs"],
    ["hou", "HOU", "Houston Astros"],
    ["lad", "LAD", "Los Angeles Dodgers"],
    ["nyy", "NYY", "New York Yankees"],
    ["phi", "PHI", "Philadelphia Phillies"],
    ["sea", "SEA", "Seattle Mariners"],
  ],
  nba: [
    ["bos", "BOS", "Boston Celtics"],
    ["cle", "CLE", "Cleveland Cavaliers"],
    ["den", "DEN", "Denver Nuggets"],
    ["gs", "GS", "Golden State Warriors"],
    ["lal", "LAL", "Los Angeles Lakers"],
    ["mil", "MIL", "Milwaukee Bucks"],
    ["ny", "NY", "New York Knicks"],
    ["okc", "OKC", "Oklahoma City Thunder"],
  ],
};

// Score range and season length per sport, so scores and records read right
// (a 3–2 hockey game, a 112–105 basketball game).
const FLAVOR: Record<string, { low: number; high: number; played: number }> = {
  nfl: { low: 10, high: 38, played: 14 },
  nhl: { low: 1, high: 6, played: 50 },
  mlb: { low: 2, high: 9, played: 90 },
  nba: { low: 92, high: 128, played: 50 },
};

const team = (league: string, [id, abbrev, name]: Row): Team => ({
  id,
  name,
  abbrev,
  logo: `https://a.espncdn.com/i/teamlogos/${league}/500/${id}.png`,
});

export function demoTeams(league: string): Team[] | null {
  const roster = ROSTERS[league];
  return roster ? roster.map((r) => team(league, r)) : null;
}

// FNV-1a, so a team's synthesized season is the same on every visit.
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// n-th deterministic draw from the seed, uniform-ish over [0, range).
function pick(seed: number, n: number, range: number): number {
  let x = seed ^ Math.imul(n + 1, 0x9e3779b9);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 13)) >>> 0) % range;
}

// Local wall-clock time `days` from today, as the UTC instant the real
// backend would send; the widget renders it back in the device's zone.
function gameStart(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function demoGames(league: string, teamId: string): GamesResponse | null {
  const roster = ROSTERS[league];
  const row = roster?.find(([id]) => id === teamId);
  if (!roster || !row) return null;

  const { low, high, played } = FLAVOR[league];
  const seed = hash(`${league}:${teamId}`);
  const others = roster.filter(([id]) => id !== teamId);
  const opponent = (n: number) => team(league, others[pick(seed, n, others.length)]);
  const score = (n: number) => low + pick(seed, 100 + n, high - low + 1);

  const teamScore = score(0);
  let oppScore = score(1);
  if (oppScore === teamScore) oppScore += 1; // the demo season has no ties
  const previous: Game = {
    id: `${teamId}-prev`,
    start: gameStart(-2, 19, 10),
    status: "final",
    home: pick(seed, 2, 2) === 0,
    opponent: opponent(3),
    teamScore,
    oppScore,
  };

  // Every ~3 days with a little jitter; offsets never collide, so the list
  // stays in ascending order. Five games — MAX_COUNT's worth.
  const upcoming: Game[] = Array.from({ length: 5 }, (_, i) => ({
    id: `${teamId}-up-${i}`,
    start: gameStart(
      1 + i * 3 + pick(seed, 10 + i, 2),
      [13, 19, 20][pick(seed, 20 + i, 3)],
      [0, 30][pick(seed, 30 + i, 2)],
    ),
    status: "scheduled" as const,
    home: pick(seed, 40 + i, 2) === 0,
    opponent: opponent(50 + i),
  }));

  const wins = Math.round((played * (35 + pick(seed, 60, 31))) / 100); // .35–.65 season
  return {
    games: {
      league,
      team: { ...team(league, row), record: `${wins}-${played - wins}` },
      fetchedAt: new Date().toISOString(),
      previous,
      upcoming,
    },
  };
}
