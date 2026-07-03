import { describe, expect, test } from "bun:test";
import { assignLanes, hourRange, nowLine, placeEvent } from "./timeGrid";

const ev = (id: number, startsAt: string, endsAt: string, allDay = false) => ({
  id,
  startsAt,
  endsAt,
  allDay,
});

describe("hourRange", () => {
  test("defaults to the waking day with no events", () => {
    expect(hourRange([], ["2026-07-16"])).toEqual({ startHour: 7, endHour: 21 });
  });
  test("stretches for early and late events", () => {
    const events = [
      ev(1, "2026-07-16T05:30:00", "2026-07-16T06:00:00"),
      ev(2, "2026-07-16T22:00:00", "2026-07-16T23:30:00"),
    ];
    expect(hourRange(events, ["2026-07-16"])).toEqual({ startHour: 5, endHour: 24 });
  });
  test("all-day events and other days do not stretch the range", () => {
    const events = [
      ev(1, "2026-07-16", "2026-07-17", true),
      ev(2, "2026-08-01T02:00:00", "2026-08-01T03:00:00"),
    ];
    expect(hourRange(events, ["2026-07-16"])).toEqual({ startHour: 7, endHour: 21 });
  });
});

describe("placeEvent", () => {
  const range = { startHour: 7, endHour: 21 }; // 14h span
  test("positions by start and duration", () => {
    const p = placeEvent(ev(1, "2026-07-16T11:00:00", "2026-07-16T12:30:00"), "2026-07-16", range);
    // 11:00 is 4h into a 14h range
    expect(p?.top).toBeCloseTo((4 / 14) * 100, 1);
    expect(p?.height).toBeGreaterThan(9); // 1.5h ≈ 10.7%
  });
  test("null for other days and all-day events", () => {
    expect(
      placeEvent(ev(1, "2026-07-15T11:00:00", "2026-07-15T12:00:00"), "2026-07-16", range),
    ).toBeNull();
    expect(placeEvent(ev(1, "2026-07-16", "2026-07-17", true), "2026-07-16", range)).toBeNull();
  });
  test("short events get a readable minimum height", () => {
    const p = placeEvent(ev(1, "2026-07-16T11:00:00", "2026-07-16T11:10:00"), "2026-07-16", range);
    expect(p?.height).toBeGreaterThanOrEqual(3.5);
  });
  test("multi-day timed events clip to the column", () => {
    const p = placeEvent(ev(1, "2026-07-15T20:00:00", "2026-07-16T10:00:00"), "2026-07-16", range);
    expect(p?.top).toBe(0);
  });
});

describe("assignLanes", () => {
  test("non-overlapping events keep the full width", () => {
    const lanes = assignLanes([
      ev(1, "2026-07-16T09:00:00", "2026-07-16T10:00:00"),
      ev(2, "2026-07-16T10:00:00", "2026-07-16T11:00:00"),
    ]);
    expect(lanes.get(1)).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get(2)).toEqual({ lane: 0, lanes: 1 });
  });
  test("overlapping events split the column", () => {
    const lanes = assignLanes([
      ev(1, "2026-07-16T09:00:00", "2026-07-16T11:00:00"),
      ev(2, "2026-07-16T10:00:00", "2026-07-16T12:00:00"),
    ]);
    expect(lanes.get(1)).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get(2)).toEqual({ lane: 1, lanes: 2 });
  });
  test("a later cluster is independent of an earlier one", () => {
    const lanes = assignLanes([
      ev(1, "2026-07-16T09:00:00", "2026-07-16T10:00:00"),
      ev(2, "2026-07-16T09:30:00", "2026-07-16T10:30:00"),
      ev(3, "2026-07-16T14:00:00", "2026-07-16T15:00:00"),
    ]);
    expect(lanes.get(2)?.lanes).toBe(2);
    expect(lanes.get(3)).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("nowLine", () => {
  const range = { startHour: 7, endHour: 21 };
  test("mid-range position", () => {
    expect(nowLine(new Date(2026, 6, 16, 14, 0), "2026-07-16", range)).toBeCloseTo(50, 1);
  });
  test("null off-day and out of range", () => {
    expect(nowLine(new Date(2026, 6, 15, 14, 0), "2026-07-16", range)).toBeNull();
    expect(nowLine(new Date(2026, 6, 16, 5, 0), "2026-07-16", range)).toBeNull();
  });
});
