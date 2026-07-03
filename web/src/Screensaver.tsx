import { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";

// DVD-style bouncing mark on pure black: burn-in protection after long
// inactivity, and the default guest experience when no guest view exists.
// Tapping wakes it — or, in persistent guest mode, reveals the exit action.

const EMBER = "#D97742";
const RING_COLORS = ["#F4F1EB", EMBER, "#C9C3B8", "#E8A87C"];

export function Screensaver({
  persistent = false,
  onWake,
  onExitGuest,
}: {
  persistent?: boolean;
  onWake?: () => void;
  onExitGuest?: () => void;
}) {
  const logoRef = useRef<HTMLDivElement>(null);
  const [showExit, setShowExit] = useState(false);

  useEffect(() => {
    const logo = logoRef.current;
    if (!logo) return;
    let x = Math.random() * 200;
    let y = Math.random() * 200;
    let dx = 1.6;
    let dy = 1.3;
    let color = 0;
    let raf: number;
    const step = () => {
      const maxX = window.innerWidth - logo.offsetWidth;
      const maxY = window.innerHeight - logo.offsetHeight;
      x += dx;
      y += dy;
      let bounced = false;
      if (x <= 0 || x >= maxX) {
        dx = -dx;
        x = Math.max(0, Math.min(x, maxX));
        bounced = true;
      }
      if (y <= 0 || y >= maxY) {
        dy = -dy;
        y = Math.max(0, Math.min(y, maxY));
        bounced = true;
      }
      if (bounced) {
        color = (color + 1) % RING_COLORS.length;
        logo.style.setProperty("--saver-ring", RING_COLORS[color]);
      }
      logo.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tapped = () => {
    if (persistent) {
      setShowExit(true);
      setTimeout(() => setShowExit(false), 6000);
    } else {
      onWake?.();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="screensaver" onPointerDown={tapped}>
      <div ref={logoRef} className="screensaver-logo">
        <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r="20"
            fill="none"
            stroke="var(--saver-ring, #F4F1EB)"
            strokeWidth="4"
          />
          <polygon points="32,22 41,30 41,41 23,41 23,30" fill="#D97742" />
        </svg>
        <span className="screensaver-wordmark">hearth</span>
      </div>
      {persistent && showExit && (
        <div className="screensaver-exit no-drag">
          <Button size="sm" variant="secondary" label="Exit guest mode" onClick={onExitGuest} />
        </div>
      )}
    </div>
  );
}
