// Date math for the countdown widget, timezone-safe: YYYY-MM-DD parsed at
// local noon so DST shifts can't move an event across midnight.

import { hasAnyTag, stripTags } from "./eventTags";

export interface CountdownItem {
  label: string;
  date: string; // YYYY-MM-DD
  fromCalendar?: boolean;
}

// Tags the widget watches for when none are configured.
export const DEFAULT_TAGS = ["countdown", "travel", "trip"];

interface CalendarEventLike {
  title: string;
  notes?: string;
  startsAt: string; // RFC3339, or YYYY-MM-DD when allDay
}

/**
 * Tagged calendar events as countdown items: match any wanted tag, count
 * down to the start date, display the tag-stripped title. Recurring events
 * sync as one row per instance, so equal labels collapse to the soonest
 * upcoming one.
 */
export function fromCalendar(
  events: CalendarEventLike[],
  tags: string[],
  now: Date,
): CountdownItem[] {
  const soonest = new Map<string, CountdownItem>();
  for (const ev of events) {
    if (!hasAnyTag(ev, tags)) continue;
    const date = ev.startsAt.slice(0, 10);
    if (daysUntil(date, now) < 0) continue;
    const label = stripTags(ev.title) || ev.title;
    const seen = soonest.get(label.toLowerCase());
    if (!seen || date < seen.date) {
      soonest.set(label.toLowerCase(), { label, date, fromCalendar: true });
    }
  }
  return [...soonest.values()];
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
