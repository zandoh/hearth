import type { Layout } from "react-grid-layout";
import type { LayoutItem } from "./types";

export const GRID_COLS = 12;

/** First position (row-major scan) where a w×h widget fits without overlap. */
export function firstFit(items: LayoutItem[], w: number, h: number): { x: number; y: number } {
  const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      const collides = items.some(
        (it) => x < it.x + it.w && it.x < x + w && y < it.y + it.h && it.y < y + h,
      );
      if (!collides) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

/** Fold the grid's live positions back into our widget items. */
export function mergePositions(items: LayoutItem[], layout: Layout | null): LayoutItem[] {
  if (!layout) return items;
  return items.map((item) => {
    const moved = layout.find((l) => l.i === item.i);
    return moved ? { ...item, x: moved.x, y: moved.y, w: moved.w, h: moved.h } : item;
  });
}
