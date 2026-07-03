// Date math for the countdown widget, timezone-safe: YYYY-MM-DD parsed at
// local noon so DST shifts can't move an event across midnight.

export interface CountdownItem {
  label: string;
  date: string; // YYYY-MM-DD
}

export const parseItems = (raw: unknown): CountdownItem[] =>
  Array.isArray(raw)
    ? raw.filter(
        (it): it is CountdownItem =>
          typeof it?.label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it?.date ?? ""),
      )
    : [];

/** Whole days from `now` until the date. 0 = today, negative = past. */
export function daysUntil(date: string, now: Date): number {
  const target = new Date(`${date}T12:00:00`);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Upcoming (today or later) items, soonest first. */
export const upcoming = (items: CountdownItem[], now: Date): CountdownItem[] =>
  items.filter((it) => daysUntil(it.date, now) >= 0).sort((a, b) => a.date.localeCompare(b.date));
