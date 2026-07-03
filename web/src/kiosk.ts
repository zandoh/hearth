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

// During night dimming, a tap wakes the board to full brightness for this
// long before the shade eases back. Overridable via ?nightWakeMs=.
export const NIGHT_WAKE_MS = 2 * 60 * 1000;

export function nightWakeMs(search: string): number {
  const raw = new URLSearchParams(search).get("nightWakeMs");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 500 ? n : NIGHT_WAKE_MS;
}

/**
 * Whether `now` falls inside the quiet window. Windows are HH:MM local and
 * may cross midnight (22:00–07:00). start === end means no window at all —
 * that shape is ambiguous, so it never dims rather than always dims.
 */
export function inQuietWindow(now: Date, start: string, end: string): boolean {
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  const n = now.getHours() * 60 + now.getMinutes();
  return s < e ? n >= s && n < e : n >= s || n < e;
}

// A view may claim a daily window (see views.schedule_start/_end); while
// the board is at rest the kiosk shows the scheduled view, falling back to
// the default outside any window. Guest mode overrides all of this — the
// caller resolves guest first, so a window firing mid-guest cannot switch
// the board off the guest view.
export interface SchedulableView {
  id: number;
  scheduleStart?: string;
  scheduleEnd?: string;
}

/** The id of the view whose window contains `now`, or null. First match wins. */
export function scheduledViewID(views: SchedulableView[], now: Date): number | null {
  for (const v of views) {
    if (v.scheduleStart && v.scheduleEnd && inQuietWindow(now, v.scheduleStart, v.scheduleEnd)) {
      return v.id;
    }
  }
  return null;
}

/**
 * The one rule for which view the kiosk shows. Precedence, strictly:
 *   1. guest mode -> the guest view, always — a scheduled window firing
 *      mid-guest must never switch the board off it;
 *   2. a manual pick (until idle-return clears it);
 *   3. a scheduled view whose window contains now;
 *   4. the default view;
 *   5. the first view.
 * Pure so every ordering is table-testable; App only supplies state.
 */
export function resolveActiveView<V extends { id: number; isDefault: boolean }>(
  views: V[],
  state: {
    guest: boolean;
    guestView: V | undefined;
    activeId: number | null;
    scheduledId: number | null;
  },
): V | undefined {
  if (state.guest) return state.guestView;
  return (
    views.find((v) => v.id === state.activeId) ??
    views.find((v) => v.id === state.scheduledId) ??
    views.find((v) => v.isDefault) ??
    views[0]
  );
}
