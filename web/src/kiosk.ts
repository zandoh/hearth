// Kiosk housekeeping: an always-on wall browser needs to heal itself.

// Reload nightly so week-long sessions don't accumulate leaks or drift
// from the server's deployed frontend.
export const NIGHTLY_RELOAD_HOUR = 3.5; // 03:30 local

// After this long without a touch, snap back to the default view and drop
// out of edit mode. Overridable for testing via ?idleMs=.
export const IDLE_RETURN_MS = 5 * 60 * 1000;

/** Milliseconds from `now` until the next nightly reload slot. */
export function msUntilNightlyReload(now: Date): number {
  const next = new Date(now);
  next.setHours(Math.floor(NIGHTLY_RELOAD_HOUR), (NIGHTLY_RELOAD_HOUR % 1) * 60, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Idle threshold, honoring the ?idleMs= debug override. */
export function idleReturnMs(search: string): number {
  const raw = new URLSearchParams(search).get("idleMs");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1000 ? n : IDLE_RETURN_MS;
}

// After this long without a touch, the screensaver takes over to spare the
// panel from burn-in. Overridable for testing via ?saverMs=.
export const SCREENSAVER_MS = 30 * 60 * 1000;

export function screensaverMs(search: string): number {
  const raw = new URLSearchParams(search).get("saverMs");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1000 ? n : SCREENSAVER_MS;
}
