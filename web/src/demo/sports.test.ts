import { describe, expect, test } from "bun:test";
import { LEAGUES, MAX_COUNT } from "../widgets/sports";
import { demoGames, demoTeams } from "./sports";

describe("demoTeams", () => {
  test("every selectable league has a roster", () => {
    for (const { value } of LEAGUES) {
      const teams = demoTeams(value);
      expect(teams).not.toBeNull();
      expect(teams?.length).toBeGreaterThanOrEqual(2);
      for (const t of teams ?? []) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.abbrev).toBeTruthy();
        expect(t.logo).toContain(`/i/teamlogos/${value}/`);
      }
    }
  });

  test("unknown league yields null", () => {
    expect(demoTeams("xfl")).toBeNull();
  });
});

describe("demoGames", () => {
  test("unknown league or team yields null", () => {
    expect(demoGames("xfl", "bos")).toBeNull();
    expect(demoGames("nhl", "nope")).toBeNull();
  });

  test("every team gets a finished previous game and a full upcoming slate", () => {
    for (const { value: league } of LEAGUES) {
      for (const t of demoTeams(league) ?? []) {
        const games = demoGames(league, t.id)?.games;
        expect(games?.league).toBe(league);
        expect(games?.team.id).toBe(t.id);
        expect(games?.team.record).toMatch(/^\d+-\d+$/);

        const prev = games?.previous;
        expect(prev?.status).toBe("final");
        expect(prev?.teamScore).not.toBe(prev?.oppScore); // W or L, never T
        expect(new Date(prev?.start ?? "").getTime()).toBeLessThan(Date.now());

        const upcoming = games?.upcoming ?? [];
        expect(upcoming.length).toBe(MAX_COUNT);
        let last = Date.now();
        for (const g of upcoming) {
          expect(g.status).toBe("scheduled");
          expect(g.opponent.id).not.toBe(t.id);
          const start = new Date(g.start).getTime();
          expect(start).toBeGreaterThan(last);
          last = start;
        }
      }
    }
  });

  test("a team's schedule is stable across calls", () => {
    const a = demoGames("nfl", "buf")?.games;
    const b = demoGames("nfl", "buf")?.games;
    expect(a?.previous).toEqual(b?.previous);
    expect(a?.upcoming).toEqual(b?.upcoming);
    expect(a?.team.record).toBe(b?.team.record ?? "");
  });
});
