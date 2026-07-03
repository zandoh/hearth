// API client + types for the calendar widget's backend
// (internal/widgets/calendar). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Calendar {
  id: number;
  name: string;
  color: string;
  kind: "local" | "google";
  googleId?: string;
  enabled: boolean;
}

export interface CalEvent {
  id: number;
  calendarId: number;
  title: string;
  startsAt: string; // RFC3339, or YYYY-MM-DD when allDay
  endsAt: string;
  allDay: boolean;
  location: string;
  notes: string;
}

export interface EventInput {
  calendarId: number;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  location?: string;
  notes?: string;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string;
}

export interface AvailableGoogleCalendar {
  googleId: string;
  name: string;
  color: string;
  primary: boolean;
  added: boolean;
}

const base = "/api/widgets/calendar";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const getCalendars = () => call<Calendar[]>("/calendars");

export const createLocalCalendar = (name: string, color: string) =>
  call<Calendar>("/calendars", { method: "POST", body: JSON.stringify({ name, color }) });

export const addGoogleCalendar = (googleId: string, name: string, color: string) =>
  call<Calendar>("/calendars", { method: "POST", body: JSON.stringify({ googleId, name, color }) });

export const updateCalendar = (cal: Calendar) =>
  call<Calendar>(`/calendars/${cal.id}`, { method: "PUT", body: JSON.stringify(cal) });

export const deleteCalendar = (id: number) => call<void>(`/calendars/${id}`, { method: "DELETE" });

export const getEvents = (start: string, end: string) =>
  call<CalEvent[]>(`/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

export const createEvent = (input: EventInput) =>
  call<CalEvent>("/events", { method: "POST", body: JSON.stringify(input) });

export const updateEvent = (id: number, input: EventInput) =>
  call<CalEvent>(`/events/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const deleteEvent = (id: number) => call<void>(`/events/${id}`, { method: "DELETE" });

export const getGoogleStatus = () => call<GoogleStatus>("/google/status");

export const getAvailableGoogleCalendars = () =>
  call<AvailableGoogleCalendar[]>("/google/available");

export const disconnectGoogle = () =>
  call<{ status: string }>("/google/disconnect", { method: "POST" });

export const syncNow = () => call<{ status: string }>("/sync", { method: "POST" });

// The connect flow is a full-page redirect (Google consent screen), not fetch.
export const googleConnectURL = `${base}/google/connect`;

// --- date helpers shared by calendar + agenda widgets ---

/** Local date as YYYY-MM-DD (never UTC — kiosk time is household time). */
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** RFC3339 with the local UTC offset, e.g. 2026-07-04T14:00:00-04:00. */
export function rfc3339Local(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  return (
    `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** True if the event touches the given local day. */
export function eventOnDay(e: CalEvent, day: string): boolean {
  if (e.allDay) {
    // endsAt is exclusive for all-day events.
    return e.startsAt <= day && day < e.endsAt;
  }
  const start = ymd(new Date(e.startsAt));
  const end = ymd(new Date(e.endsAt));
  return start <= day && day <= end;
}

export function eventTimeLabel(e: CalEvent): string {
  if (e.allDay) return "all day";
  return new Date(e.startsAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The dates for an edited event. Editing must not reshape the event: an
 * all-day event keeps its exact span (a week-long event edited for a typo
 * stays week-long — this earned a production bug), a timed event keeps its
 * date and duration with only the time-of-day applied. Toggling the
 * all-day flag falls back to the create-style defaults, since the old
 * duration stops meaning anything.
 */
export function editedDates(
  e: Pick<CalEvent, "startsAt" | "endsAt" | "allDay">,
  form: { allDay: boolean; time: string },
): { startsAt: string; endsAt?: string } {
  const baseDate = e.startsAt.slice(0, 10);
  if (form.allDay && e.allDay) return { startsAt: e.startsAt, endsAt: e.endsAt };
  if (!form.allDay && !e.allDay) {
    const startsAt = rfc3339Local(new Date(`${baseDate}T${form.time}:00`));
    const duration = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
    return {
      startsAt,
      endsAt:
        duration > 0 ? rfc3339Local(new Date(new Date(startsAt).getTime() + duration)) : undefined,
    };
  }
  return {
    startsAt: form.allDay ? baseDate : rfc3339Local(new Date(`${baseDate}T${form.time}:00`)),
    endsAt: undefined,
  };
}
