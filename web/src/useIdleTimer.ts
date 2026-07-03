import { useEffect, useRef } from "react";

// The kiosk's idle primitive: after `ms` with no touch (pointer, key,
// wheel, touch), fire onIdle — then re-arm, so continued silence fires
// again each `ms`. One definition of "a touch" for every idle-driven
// behaviour; previously each consumer duplicated the listener and
// interval bookkeeping.
export function useIdleTimer(ms: number, onIdle: () => void) {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, touch, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - last >= ms) {
        last = Date.now();
        cb.current();
      }
    }, 1000);
    return () => {
      clearInterval(id);
      for (const ev of events) window.removeEventListener(ev, touch);
    };
  }, [ms]);
}
