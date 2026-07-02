import { describe, expect, test } from "bun:test";
import { firstFit, mergePositions } from "./layout";
import type { LayoutItem } from "./types";

const item = (i: string, x: number, y: number, w: number, h: number): LayoutItem => ({
  i,
  widget: "clock",
  x,
  y,
  w,
  h,
  config: {},
});

describe("firstFit", () => {
  test("empty grid places at origin", () => {
    expect(firstFit([], 4, 3)).toEqual({ x: 0, y: 0 });
  });

  test("places beside an existing widget when there is room", () => {
    // clock is 4 wide; a 6-wide calendar fits beside it on a 12-col grid
    expect(firstFit([item("clock-1", 0, 0, 4, 3)], 6, 6)).toEqual({ x: 4, y: 0 });
  });

  test("fills a gap between widgets", () => {
    const items = [item("a", 0, 0, 4, 3), item("b", 8, 0, 4, 3)];
    expect(firstFit(items, 4, 3)).toEqual({ x: 4, y: 0 });
  });

  test("wraps to a new row only when the row is full", () => {
    const items = [item("a", 0, 0, 6, 3), item("b", 6, 0, 6, 3)];
    expect(firstFit(items, 4, 3)).toEqual({ x: 0, y: 3 });
  });

  test("respects partial vertical overlap", () => {
    // tall widget on the left, shorter one top right: a 4x2 fits under the
    // short one at (8,2)... but first fit row-major finds (4,0) free? no —
    // (4,0) collides with nothing? b spans x8-12 y0-2; a spans x0-4 y0-6.
    const items = [item("a", 0, 0, 4, 6), item("b", 8, 0, 4, 2)];
    expect(firstFit(items, 4, 2)).toEqual({ x: 4, y: 0 });
  });
});

describe("mergePositions", () => {
  test("null layout returns items unchanged", () => {
    const items = [item("a", 0, 0, 4, 3)];
    expect(mergePositions(items, null)).toEqual(items);
  });

  test("applies moved positions and keeps widget metadata", () => {
    const items = [item("a", 0, 0, 4, 3), item("b", 0, 3, 6, 6)];
    const merged = mergePositions(items, [
      { i: "a", x: 6, y: 0, w: 4, h: 3 },
      { i: "b", x: 0, y: 0, w: 6, h: 6 },
    ]);
    expect(merged[0]).toMatchObject({ i: "a", widget: "clock", x: 6, y: 0 });
    expect(merged[1]).toMatchObject({ i: "b", x: 0, y: 0, w: 6, h: 6 });
  });

  test("items missing from the layout keep their position", () => {
    const items = [item("a", 2, 2, 4, 3)];
    const merged = mergePositions(items, [{ i: "other", x: 0, y: 0, w: 1, h: 1 }]);
    expect(merged[0]).toMatchObject({ x: 2, y: 2 });
  });
});
