import { describe, expect, test } from "bun:test";
import type { Layout, LayoutItem } from "react-grid-layout";
import { createCompactor } from "./compactor";

const item = (i: string, x: number, y: number, w = 4, h = 2): LayoutItem => ({ i, x, y, w, h });

const pos = (layout: Layout, i: string) => {
  const it = layout.find((l) => l.i === i);
  if (!it) throw new Error(`no item ${i}`);
  return { x: it.x, y: it.y };
};

describe("createCompactor", () => {
  test("collision-push moves an overlapped item down, just far enough", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2)], "a");
    // a dragged down one row onto b: a is authoritative, b slides down.
    const out = c.compactor.compact([item("a", 0, 1), item("b", 0, 2)], 12);
    expect(pos(out, "a")).toEqual({ x: 0, y: 1 });
    expect(pos(out, "b")).toEqual({ x: 0, y: 3 });
  });

  test("a pushed item springs back to its gesture-home when space frees", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2)], "a");
    c.compactor.compact([item("a", 0, 1), item("b", 0, 2)], 12); // b pushed to 3
    // Intruder moves well away: b returns to its snapshot home, not to
    // wherever the last tick left it.
    const out = c.compactor.compact([item("a", 6, 6), item("b", 0, 3)], 12);
    expect(pos(out, "b")).toEqual({ x: 0, y: 2 });
  });

  test("no jiggle: identical drag ticks are stable and idempotent", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2), item("d", 0, 4)], "a");
    const drag: Layout = [item("a", 0, 1), item("b", 0, 2), item("d", 0, 4)];
    const out1 = c.compactor.compact(drag, 12);
    // The grid feeds the compacted layout back on the next tick (with the
    // drag item unchanged); the result must not drift.
    const out2 = c.compactor.compact(out1, 12);
    const out3 = c.compactor.compact(out2, 12);
    expect(out2).toEqual(out1);
    expect(out3).toEqual(out1);
    // Chain: a displaced b, which displaced d — and each sits just below.
    expect(pos(out1, "b")).toEqual({ x: 0, y: 3 });
    expect(pos(out1, "d")).toEqual({ x: 0, y: 5 });
  });

  test("displacement never accumulates along the drag path", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2)], "a");
    // Drag a down through b's row repeatedly, deeper each tick.
    c.compactor.compact([item("a", 0, 1), item("b", 0, 2)], 12);
    c.compactor.compact([item("a", 0, 2), item("b", 0, 3)], 12);
    const out = c.compactor.compact([item("a", 0, 3), item("b", 0, 4)], 12);
    // b sits just below a (home 2 is blocked), not shoved by the sum of ticks.
    expect(pos(out, "b")).toEqual({ x: 0, y: 5 });
  });

  test("tray drag: items not in the snapshot count as intruders", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0)], null); // drag-over from the tray
    const out = c.compactor.compact([item("a", 0, 0), item("drop", 0, 0)], 12);
    expect(pos(out, "drop")).toEqual({ x: 0, y: 0 });
    expect(pos(out, "a")).toEqual({ x: 0, y: 2 });
  });

  test("endGesture settles strictly and clears gesture state", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2)], "a");
    c.compactor.compact([item("a", 0, 1), item("b", 0, 2)], 12); // b pushed
    // Drop a somewhere harmless: hysteresis is discarded, b springs home,
    // and a keeps its final (authoritative) spot.
    const settled = c.endGesture([item("a", 0, 6), item("b", 0, 3)], 12);
    expect(pos(settled, "a")).toEqual({ x: 0, y: 6 });
    expect(pos(settled, "b")).toEqual({ x: 0, y: 2 });
    expect(c.inGesture()).toBe(false);
    // Outside a gesture a non-overlapping layout passes through unchanged.
    const idle: Layout = [item("a", 0, 6), item("b", 0, 2)];
    expect(c.compactor.compact(idle, 12)).toEqual(idle);
  });

  test("cancelGesture resets state between gestures", () => {
    const c = createCompactor();
    c.beginGesture([item("a", 0, 0), item("b", 0, 2)], "a");
    c.compactor.compact([item("a", 0, 1), item("b", 0, 2)], 12);
    c.cancelGesture();
    expect(c.inGesture()).toBe(false);
    // A fresh gesture starts from clean snapshots — no leftover homes or
    // pushed-last-tick stickiness from the previous gesture.
    c.beginGesture([item("a", 0, 1), item("b", 0, 3)], "b");
    const out = c.compactor.compact([item("a", 0, 1), item("b", 0, 3)], 12);
    expect(pos(out, "a")).toEqual({ x: 0, y: 1 });
    expect(pos(out, "b")).toEqual({ x: 0, y: 3 });
  });
});
