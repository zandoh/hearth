import { useEffect, useRef, useState } from "react";

// Pointer-drag transport, built on two production lessons:
//
// 1. Listeners live on the window for the whole gesture. Moving a DOM node mid-drag
//    (a list row re-slotting) releases element pointer capture and loses the
//    pointerup, and the order never saved.
// 2. The gesture payload is in a ref. Touch event bursts outrun React re-renders, so
//    end handlers must never read drag state from a closure.
//
// This module owns only the transport. What a move means (wall clamping, midpoint
// re-slotting, collision push) stays with the caller. The Compactor keeps its own
// closure: its gesture state is board geometry, not pointer plumbing.
export function usePointerDrag<T>(handlers: {
  onMove: (e: PointerEvent, drag: T) => void;
  onEnd: (drag: T) => void;
}) {
  const dragRef = useRef<T | null>(null);
  const [dragging, setDragging] = useState(false);
  const h = useRef(handlers);
  h.current = handlers;

  const start = (drag: T, e?: { preventDefault(): void }) => {
    e?.preventDefault();
    dragRef.current = drag;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (dragRef.current !== null) h.current.onMove(e, dragRef.current);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (d !== null) h.current.onEnd(d);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  return { start, dragging };
}
