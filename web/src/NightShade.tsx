import { useCallback, useEffect, useRef, useState } from "react";
import { inQuietWindow, nightWakeMs } from "./kiosk";
import { type NightConfig, getNightConfig } from "./night";
import { TOPICS } from "./topics";
import { useTopic } from "./useSSE";

// The night shade: a full-screen scrim that eases in during the household's
// quiet window. It sits above everything (screensaver included) so the whole
// panel dims. While dim it swallows the first tap as "wake" — a 2 AM touch
// shouldn't also toggle whatever was under the finger — then stays bright
// for a grace period before easing back.
export function NightShade() {
  const [cfg, setCfg] = useState<NightConfig | null>(null);
  const [awake, setAwake] = useState(false);
  const [, setTick] = useState(0);
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => {
    getNightConfig().then(setCfg).catch(console.error);
  }, []);
  useEffect(reload, [reload]);
  useTopic(TOPICS.night, reload);

  // Re-evaluate the window twice a minute so the shade arrives on schedule.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
    },
    [],
  );

  const wake = () => {
    setAwake(true);
    if (wakeTimer.current) clearTimeout(wakeTimer.current);
    wakeTimer.current = setTimeout(() => setAwake(false), nightWakeMs(window.location.search));
  };

  if (!cfg?.enabled) return null;
  const dimmed = inQuietWindow(new Date(), cfg.start, cfg.end) && !awake;

  return (
    <div
      className={`night-shade${dimmed ? " on" : ""}`}
      style={{ opacity: dimmed ? cfg.level : 0 }}
      onPointerDown={dimmed ? wake : undefined}
      aria-hidden
    />
  );
}
