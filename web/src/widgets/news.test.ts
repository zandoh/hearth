import { describe, expect, test } from "bun:test";
import { DEFAULT_COUNT, DEFAULT_TOPIC, NEWS_TOPICS, parseNewsConfig, timeAgo } from "./news";

describe("parseNewsConfig", () => {
  test("empty config defaults to top stories", () => {
    expect(parseNewsConfig({})).toEqual({ topic: DEFAULT_TOPIC, count: DEFAULT_COUNT });
  });

  test("reads a saved config", () => {
    expect(parseNewsConfig({ topic: "science", count: 8 })).toEqual({
      topic: "science",
      count: 8,
    });
  });

  test("unknown topics fall back to the default", () => {
    expect(parseNewsConfig({ topic: "gossip" }).topic).toBe(DEFAULT_TOPIC);
    expect(parseNewsConfig({ topic: 7 }).topic).toBe(DEFAULT_TOPIC);
  });

  test("clamps and sanitizes count", () => {
    expect(parseNewsConfig({ count: 0 }).count).toBe(1);
    expect(parseNewsConfig({ count: 99 }).count).toBe(10);
    expect(parseNewsConfig({ count: Number.NaN }).count).toBe(DEFAULT_COUNT);
    expect(parseNewsConfig({ count: "4" }).count).toBe(DEFAULT_COUNT);
  });

  test("every selectable topic parses through unchanged", () => {
    for (const { value } of NEWS_TOPICS) {
      expect(parseNewsConfig({ topic: value }).topic).toBe(value);
    }
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-07-13T12:00:00Z");
  test("bands", () => {
    expect(timeAgo("2026-07-13T11:59:40Z", now)).toBe("now");
    expect(timeAgo("2026-07-13T11:25:00Z", now)).toBe("35m");
    expect(timeAgo("2026-07-13T08:00:00Z", now)).toBe("4h");
    expect(timeAgo("2026-07-11T11:00:00Z", now)).toBe("2d");
  });
  test("future timestamps clamp to now", () => {
    expect(timeAgo("2026-07-13T12:03:00Z", now)).toBe("now");
  });
  test("garbage dates render empty", () => {
    expect(timeAgo("not a date", now)).toBe("");
  });
});
