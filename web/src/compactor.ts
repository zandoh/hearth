import type { Compactor, Layout, LayoutItem } from "react-grid-layout";

// Free placement: gaps stay where you put them (no gravity), but collisions
// PUSH — Datadog-style. The key to "shift just enough": pushes are computed
// against a SNAPSHOT of the layout taken when the gesture started, not
// against wherever the last drag-tick shoved things. Every displaced widget
// keeps trying to return to its home spot and only sits as far down as the
// intruder actually forces it, so displacement never accumulates along the
// drag path and widgets spring back when the intruder moves away.

const collide = (a: LayoutItem, b: LayoutItem) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const nearby = (a: LayoutItem, b: LayoutItem) =>
  collide({ ...a, x: a.x - 1, y: a.y - 1, w: a.w + 2, h: a.h + 2 }, b);

export interface FreePlacementCompactor {
  /** Hand this to react-grid-layout's `compactor` prop. */
  compactor: Compactor;
  /**
   * Snapshot every widget's gesture-home at gesture start. `activeId` is the
   * item being dragged/resized (null for a tray drag, whose preview item is
   * recognized as the intruder by not being in the snapshot).
   */
  beginGesture(
    items: ReadonlyArray<{ i: string; x: number; y: number }>,
    activeId: string | null,
  ): void;
  /** True while a gesture snapshot is active. */
  inGesture(): boolean;
  /**
   * Final placement is strict: drop the hysteresis so a widget that was only
   * sticky-pushed springs home, settle the layout one last time, and clear
   * all gesture state. Returns the settled layout to persist.
   */
  endGesture(layout: Layout, cols: number): Layout;
  /** Drop all gesture state without settling (e.g. after a tray drop). */
  cancelGesture(): void;
}

/**
 * One compactor per grid: the gesture-home snapshot and push hysteresis live
 * in this closure, never in module-level globals.
 */
export function createCompactor(): FreePlacementCompactor {
  const gestureHomes = new Map<string, { x: number; y: number }>();
  let gestureItemId: string | null = null;
  // Hysteresis: widgets pushed on the previous tick stay pushed until the
  // intruder clears them by a full cell. Without this, cursor jitter at a
  // cell boundary makes neighbours oscillate home/pushed — the "jiggle".
  const pushedLastTick = new Set<string>();

  const compactor: Compactor = {
    type: null,
    allowOverlap: false,
    compact: (layout) => {
      const placed: LayoutItem[] = [];
      const isIntruder = (it: LayoutItem) =>
        it.i === gestureItemId || (gestureHomes.size > 0 && !gestureHomes.has(it.i));
      // The item being dragged/resized/dropped is authoritative: place it
      // first at its current position.
      const intruders: LayoutItem[] = [];
      for (const item of layout) {
        if (isIntruder(item)) {
          const it = { ...item };
          intruders.push(it);
          placed.push(it);
        }
      }
      // Everyone else starts from their gesture-start home (falling back to
      // their current spot) and slides down only as far as needed.
      const rest = layout
        .filter((it) => !isIntruder(it))
        .map((it) => {
          const home = gestureHomes.get(it.i);
          return { ...it, x: home?.x ?? it.x, y: home?.y ?? it.y };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const nowPushed = new Set<string>();
      for (const it of rest) {
        const mustPush =
          placed.some((p) => collide(p, it)) ||
          // sticky: was pushed and the intruder is still within one cell
          (pushedLastTick.has(it.i) && intruders.some((p) => nearby(p, it)));
        if (mustPush) {
          while (placed.some((p) => collide(p, it))) it.y += 1;
          // re-settle upward toward home so a sticky push sits snug, not deep
          while (it.y > (gestureHomes.get(it.i)?.y ?? it.y)) {
            const up = { ...it, y: it.y - 1 };
            if (placed.some((p) => collide(p, up))) break;
            it.y = up.y;
          }
          if (it.y !== (gestureHomes.get(it.i)?.y ?? it.y)) nowPushed.add(it.i);
        }
        placed.push(it);
      }
      if (gestureHomes.size > 0) {
        pushedLastTick.clear();
        for (const id of nowPushed) pushedLastTick.add(id);
      }
      return layout.map((orig) => placed.find((p) => p.i === orig.i) ?? { ...orig });
    },
  };

  return {
    compactor,
    beginGesture(items, activeId) {
      gestureHomes.clear();
      for (const it of items) gestureHomes.set(it.i, { x: it.x, y: it.y });
      gestureItemId = activeId;
    },
    inGesture: () => gestureHomes.size > 0,
    endGesture(layout, cols) {
      pushedLastTick.clear();
      const settled = compactor.compact(layout, cols);
      gestureHomes.clear();
      gestureItemId = null;
      return settled;
    },
    cancelGesture() {
      pushedLastTick.clear();
      gestureHomes.clear();
      gestureItemId = null;
    },
  };
}
