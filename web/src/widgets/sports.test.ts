import { describe, expect, test } from "bun:test";
import { DEFAULT_COUNT, opponentLabel, parseSportsConfig, resultLabel } from "./sports";

describe("parseSportsConfig", () => {
  test("empty config yields unconfigured defaults", () => {
    const cfg = parseSportsConfig({});
    expect(cfg.league).toBe("");
    expect(cfg.teamId).toBe("");
    expect(cfg.count).toBe(DEFAULT_COUNT);
  });

  test("reads a saved config", () => {
    const cfg = parseSportsConfig({
      league: "nfl",
      teamId: "2",
      teamName: "Buffalo Bills",
      abbrev: "BUF",
      count: 5,
    });
    expect(cfg).toEqual({
      league: "nfl",
      teamId: "2",
      teamName: "Buffalo Bills",
      abbrev: "BUF",
      count: 5,
    });
  });

  test("clamps and sanitizes count", () => {
    expect(parseSportsConfig({ count: 0 }).count).toBe(1);
    expect(parseSportsConfig({ count: 99 }).count).toBe(5);
    expect(parseSportsConfig({ count: 2.6 }).count).toBe(3);
    expect(parseSportsConfig({ count: Number.NaN }).count).toBe(DEFAULT_COUNT);
    expect(parseSportsConfig({ count: "4" }).count).toBe(DEFAULT_COUNT);
  });

  test("tolerates junk types", () => {
    const cfg = parseSportsConfig({ league: 7, teamId: null, teamName: ["x"] });
    expect(cfg.league).toBe("");
    expect(cfg.teamId).toBe("");
    expect(cfg.teamName).toBe("");
  });
});

describe("opponentLabel", () => {
  const opp = { id: "15", name: "Miami Dolphins", abbrev: "MIA" };
  test("home game reads vs", () => {
    expect(opponentLabel({ home: true, opponent: opp })).toBe("vs MIA");
  });
  test("road game reads @", () => {
    expect(opponentLabel({ home: false, opponent: opp })).toBe("@ MIA");
  });
  test("falls back to the name when abbrev is missing", () => {
    expect(opponentLabel({ home: true, opponent: { ...opp, abbrev: "" } })).toBe(
      "vs Miami Dolphins",
    );
  });
});

describe("resultLabel", () => {
  test("win, loss, tie from the tracked team's perspective", () => {
    expect(resultLabel({ teamScore: 21, oppScore: 17 })).toEqual({ outcome: "W", score: "21–17" });
    expect(resultLabel({ teamScore: 0, oppScore: 3 })).toEqual({ outcome: "L", score: "0–3" });
    expect(resultLabel({ teamScore: 20, oppScore: 20 })).toEqual({ outcome: "T", score: "20–20" });
  });
  test("no scores yet means no result", () => {
    expect(resultLabel({})).toBeNull();
    expect(resultLabel({ teamScore: 3 })).toBeNull();
  });
});
