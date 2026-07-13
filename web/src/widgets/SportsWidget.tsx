import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { TOPICS } from "../topics";
import { useMutate } from "../useMutate";
import { useTopicData } from "../useWidgetData";
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import {
  LEAGUE_ICONS,
  LEAGUES,
  MAX_COUNT,
  opponentLabel,
  parseSportsConfig,
  resultLabel,
} from "./sports";
import { type Game, type GamesResponse, type Team, getGames, getTeams } from "./sportsApi";

// One team's pulse: the last result, the live score while a game is on, and
// the next few matchups. League and team are per-instance config, so a
// household can pin one card per team it follows.

const gameDay = (start: string) =>
  new Date(start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

const gameTime = (start: string) =>
  new Date(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function SectionLabel({ children }: { children: string }) {
  return (
    <Text type="supporting" size="xsm">
      {children}
    </Text>
  );
}

// Team logo off ESPN's CDN; hides itself if the kiosk is offline or the
// URL rots, leaving the name to carry recognition.
function TeamLogo({ src, name }: { src: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img className="sports-logo" src={src} alt={`${name} logo`} onError={() => setBroken(true)} />
  );
}

export function SportsWidget({ item }: WidgetProps) {
  const cfg = parseSportsConfig(item.config);
  const configured = cfg.league !== "" && cfg.teamId !== "";
  // The fetch carries per-instance params, so this widget uses useTopicData
  // directly instead of the slug-derived useWidgetData.
  const fetcher = useCallback(
    () => (configured ? getGames(cfg.league, cfg.teamId) : Promise.resolve(null)),
    [configured, cfg.league, cfg.teamId],
  );
  const { data } = useTopicData<GamesResponse | null>(TOPICS.sports, fetcher);

  if (!configured) {
    return (
      <VStack className="widget-body" justify="center">
        <EmptyState
          isCompact
          title="Pick a team"
          description="Choose a league and team in this widget's settings."
        />
      </VStack>
    );
  }

  const games = data?.games;
  if (!games) {
    return (
      <VStack className="widget-body" justify="center" align="center">
        <Text type="supporting">{data?.pending ? "Fetching games…" : "Loading…"}</Text>
      </VStack>
    );
  }

  const team = games.team.id !== "" ? games.team : { name: cfg.teamName, abbrev: cfg.abbrev };
  const abbrev = team.abbrev || team.name;
  const prev = games.previous ? resultLabel(games.previous) : null;
  const upcoming = games.upcoming.slice(0, cfg.count);

  return (
    <VStack className="widget-body" gap={3}>
      <HStack gap={2} align="center">
        <TeamLogo src={games.team.logo || cfg.logo} name={team.name || cfg.teamName} />
        <Text weight="semibold" maxLines={1} className="min-w-0">
          {team.name || cfg.teamName}
        </Text>
        {games.team.record && (
          <Text type="supporting" size="xsm" hasTabularNumbers>
            {games.team.record}
          </Text>
        )}
        <span className="sports-league-icon ml-auto" aria-label={cfg.league.toUpperCase()}>
          {LEAGUE_ICONS[cfg.league]}
        </span>
      </HStack>

      {games.live && (
        <VStack gap={1}>
          <HStack gap={2} align="center">
            <Badge variant="red" label="LIVE" />
            <Text type="supporting" size="xsm">
              {games.live.detail}
            </Text>
          </HStack>
          <Text type="display-2" hasTabularNumbers className="brand-data">
            {abbrev} {games.live.teamScore ?? 0} – {games.live.oppScore ?? 0}{" "}
            {games.live.opponent.abbrev || games.live.opponent.name}
          </Text>
        </VStack>
      )}

      {games.previous && (
        <VStack gap={1}>
          <SectionLabel>LAST</SectionLabel>
          <HStack gap={2} align="center">
            {prev && (
              <Badge variant={prev.outcome === "W" ? "green" : "neutral"} label={prev.outcome} />
            )}
            <Text maxLines={1} className="min-w-0 flex-1">
              {opponentLabel(games.previous)}
            </Text>
            {prev && <Text hasTabularNumbers>{prev.score}</Text>}
            <Text type="supporting" size="xsm">
              {gameDay(games.previous.start)}
            </Text>
          </HStack>
        </VStack>
      )}

      <VStack gap={1}>
        <SectionLabel>NEXT</SectionLabel>
        {upcoming.length === 0 ? (
          <Text type="supporting">No upcoming games</Text>
        ) : (
          upcoming.map((g: Game) => (
            <HStack key={g.id} gap={2} align="center">
              <Text maxLines={1} className="min-w-0 flex-1">
                {opponentLabel(g)}
              </Text>
              <Text type="supporting" size="xsm" hasTabularNumbers>
                {gameDay(g.start)} · {gameTime(g.start)}
              </Text>
            </HStack>
          ))
        )}
      </VStack>
    </VStack>
  );
}

export function SportsSettings({ config, save }: WidgetSettingsProps) {
  const cfg = parseSportsConfig(config);
  const [league, setLeague] = useState(cfg.league);
  const [teamId, setTeamId] = useState(cfg.teamId);
  const [count, setCount] = useState(cfg.count);
  const [teamsByLeague, setTeamsByLeague] = useState<Record<string, Team[]>>({});
  const { mutate, error } = useMutate();

  // Prefetch every league on open (the backend keeps the lists warm, so
  // these are LAN-local) — by the time a league is picked, its teams are
  // already here and the dropdown appears without a loading swap.
  useEffect(() => {
    let stale = false;
    for (const { value } of LEAGUES) {
      getTeams(value)
        .then((list) => {
          if (!stale) setTeamsByLeague((m) => ({ ...m, [value]: list }));
        })
        .catch(console.error); // retried via the league-change path below
    }
    return () => {
      stale = true;
    };
  }, []);

  // Retry path: picking a league whose prefetch failed refetches it with a
  // visible error state.
  const teams = league ? (teamsByLeague[league] ?? null) : null;
  useEffect(() => {
    if (!league || teamsByLeague[league]) return;
    let stale = false;
    mutate(async () => {
      const list = await getTeams(league);
      if (!stale) setTeamsByLeague((m) => ({ ...m, [league]: list }));
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  const apply = () => {
    if (!league || !teamId) return;
    const team = teams?.find((t) => t.id === teamId);
    save({
      ...config,
      league,
      teamId,
      teamName: team?.name ?? cfg.teamName,
      abbrev: team?.abbrev ?? cfg.abbrev,
      logo: team?.logo ?? cfg.logo,
      count,
    });
  };

  return (
    <VStack gap={3}>
      <Selector
        label="League"
        placeholder="Choose a league"
        value={league || undefined}
        options={LEAGUES}
        onChange={(v) => {
          setLeague(v ?? "");
          setTeamId("");
        }}
      />
      {league &&
        (teams ? (
          <Selector
            label="Team"
            placeholder="Choose a team"
            value={teamId || undefined}
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(v) => setTeamId(v ?? "")}
          />
        ) : (
          !error && <Text type="supporting">Loading teams…</Text>
        ))}
      <Selector
        label="Upcoming games shown"
        value={String(count)}
        options={Array.from({ length: MAX_COUNT }, (_, i) => String(i + 1))}
        onChange={(v) => setCount(Number(v ?? count))}
      />
      {error && <Text className="form-error">{error}</Text>}
      <HStack justify="end">
        <Button size="sm" variant="primary" label="Save" onClick={apply} />
      </HStack>
    </VStack>
  );
}
