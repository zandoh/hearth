import { describe, expect, test } from "bun:test";
import {
  IDLE_RETURN_MS,
  NIGHT_WAKE_MS,
  idleReturnMs,
  inQuietWindow,
  msUntilNightlyReload,
  nightWakeMs,
} from "./kiosk";

describe("msUntilNightlyReload", () => {
  test("before the slot: later the same night", () => {
    const now = new Date(2026, 6, 2, 1, 0, 0);
    expect(msUntilNightlyReload(now)).toBe(2.5 * 60 * 60 * 1000);
  });

  test("after the slot: tomorrow night", () => {
    const now = new Date(2026, 6, 2, 12, 0, 0);
    // 12h to midnight + 3.5h
    expect(msUntilNightlyReload(now)).toBe(15.5 * 60 * 60 * 1000);
  });

  test("exactly at the slot: a full day away", () => {
    const now = new Date(2026, 6, 2, 3, 30, 0);
    expect(msUntilNightlyReload(now)).toBe(24 * 60 * 60 * 1000);
  });
});

describe("idleReturnMs", () => {
  test("default without override", () => {
    expect(idleReturnMs("")).toBe(IDLE_RETURN_MS);
  });
  test("debug override", () => {
    expect(idleReturnMs("?idleMs=3000")).toBe(3000);
  });
  test("garbage and too-small values fall back", () => {
    expect(idleReturnMs("?idleMs=nope")).toBe(IDLE_RETURN_MS);
    expect(idleReturnMs("?idleMs=10")).toBe(IDLE_RETURN_MS);
  });
});

describe("inQuietWindow", () => {
  const at = (h: number, m = 0) => new Date(2026, 6, 2, h, m);

  test("overnight window spans midnight", () => {
    expect(inQuietWindow(at(23), "22:00", "07:00")).toBe(true);
    expect(inQuietWindow(at(3), "22:00", "07:00")).toBe(true);
    expect(inQuietWindow(at(12), "22:00", "07:00")).toBe(false);
  });

  test("same-day window", () => {
    expect(inQuietWindow(at(14), "13:00", "15:00")).toBe(true);
    expect(inQuietWindow(at(16), "13:00", "15:00")).toBe(false);
  });

  test("boundaries: start inclusive, end exclusive", () => {
    expect(inQuietWindow(at(22, 0), "22:00", "07:00")).toBe(true);
    expect(inQuietWindow(at(7, 0), "22:00", "07:00")).toBe(false);
  });

  test("start === end never dims", () => {
    expect(inQuietWindow(at(22), "22:00", "22:00")).toBe(false);
  });
});

describe("nightWakeMs", () => {
  test("default without override", () => {
    expect(nightWakeMs("")).toBe(NIGHT_WAKE_MS);
  });
  test("debug override, garbage falls back", () => {
    expect(nightWakeMs("?nightWakeMs=1500")).toBe(1500);
    expect(nightWakeMs("?nightWakeMs=nah")).toBe(NIGHT_WAKE_MS);
  });
});
