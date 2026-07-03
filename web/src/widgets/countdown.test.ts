import { describe, expect, test } from "bun:test";
import { daysUntil, parseItems, upcoming } from "./countdown";

const now = new Date(2026, 6, 3, 23, 30); // July 3, late evening

describe("daysUntil", () => {
  test("today is 0 even late at night", () => {
    expect(daysUntil("2026-07-03", now)).toBe(0);
  });
  test("tomorrow is 1", () => {
    expect(daysUntil("2026-07-04", now)).toBe(1);
  });
  test("crosses months and DST", () => {
    expect(daysUntil("2026-11-14", now)).toBe(134);
  });
  test("past is negative", () => {
    expect(daysUntil("2026-07-01", now)).toBe(-2);
  });
});

describe("upcoming", () => {
  test("filters past, sorts soonest first", () => {
    const items = [
      { label: "Wedding", date: "2026-11-14" },
      { label: "Yesterday", date: "2026-07-02" },
      { label: "Trip", date: "2026-08-01" },
    ];
    expect(upcoming(items, now).map((i) => i.label)).toEqual(["Trip", "Wedding"]);
  });
});

describe("parseItems", () => {
  test("drops malformed entries", () => {
    expect(
      parseItems([{ label: "ok", date: "2026-01-01" }, { label: "bad", date: "soon" }, "junk"]),
    ).toEqual([{ label: "ok", date: "2026-01-01" }]);
  });
  test("non-array becomes empty", () => {
    expect(parseItems(undefined)).toEqual([]);
  });
});
