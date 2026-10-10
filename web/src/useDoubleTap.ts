import { useCallback, useRef } from "react";
import type { PointerEvent } from "react";

// Hand-rolled, not the native dblclick: touch panels don't fire dblclick reliably (and
// a double tap can zoom the page). Pointer events cover mouse and touch with one path.
const MAX_GAP_MS = 350;
const MAX_TRAVEL_PX = 24;

// Text-entry controls keep native double-click behavior (word select, caret). Every
// other target, buttons included, counts toward the double tap. Otherwise widgets with
// mostly interactive surfaces could never zoom.
const TEXT_ENTRY =
  "input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']";

/**
 * Detects a double tap or click from raw pointer events. Returns a factory: spread
 * `tap(key, onDoubleTap)` onto an element. `key` scopes the pair, so quick taps on two
 * elements never count as a double.
 */
export function useDoubleTap() {
  const down = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ key: string; time: number; x: number; y: number } | null>(null);

  return useCallback(
    (key: string, onDoubleTap: () => void) => ({
      onPointerDown: (e: PointerEvent) => {
        down.current =
          e.isPrimary && !(e.target as Element).closest(TEXT_ENTRY)
            ? { x: e.clientX, y: e.clientY }
            : null;
      },
      onPointerUp: (e: PointerEvent) => {
        const start = down.current;
        down.current = null;
        if (!start) return;
        // Travelled since pointerdown: a scroll or drag, not a tap.
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MAX_TRAVEL_PX) return;
        const prev = lastTap.current;
        if (
          prev &&
          prev.key === key &&
          e.timeStamp - prev.time <= MAX_GAP_MS &&
          Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= MAX_TRAVEL_PX * 2
        ) {
          lastTap.current = null;
          onDoubleTap();
        } else {
          lastTap.current = { key, time: e.timeStamp, x: e.clientX, y: e.clientY };
        }
      },
    }),
    [],
  );
}
