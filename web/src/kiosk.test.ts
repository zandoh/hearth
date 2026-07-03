import { describe, expect, test } from "bun:test";
import { IDLE_RETURN_MS, idleReturnMs, msUntilNightlyReload } from "./kiosk";

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
