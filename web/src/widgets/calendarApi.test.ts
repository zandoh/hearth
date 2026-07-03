import { describe, expect, test } from "bun:test";
import { editedDates } from "./calendarApi";

describe("editedDates", () => {
  test("all-day events keep their exact span — the truncation bug", () => {
    const e = { startsAt: "2026-07-15", endsAt: "2026-07-22", allDay: true };
    expect(editedDates(e, { allDay: true, time: "12:00" })).toEqual({
      startsAt: "2026-07-15",
      endsAt: "2026-07-22",
    });
  });
  test("timed events keep date and duration, new time-of-day applied", () => {
    const e = {
      startsAt: "2026-07-16T09:00:00-04:00",
      endsAt: "2026-07-16T11:30:00-04:00",
      allDay: false,
    };
    const d = editedDates(e, { allDay: false, time: "14:00" });
    expect(d.startsAt).toContain("2026-07-16T14:00");
    expect(new Date(d.endsAt!).getTime() - new Date(d.startsAt).getTime()).toBe(2.5 * 3600000);
  });
  test("toggling to all-day falls back to a one-day default on the same date", () => {
    const e = {
      startsAt: "2026-07-16T09:00:00-04:00",
      endsAt: "2026-07-16T10:00:00-04:00",
      allDay: false,
    };
    expect(editedDates(e, { allDay: true, time: "09:00" })).toEqual({
      startsAt: "2026-07-16",
      endsAt: undefined,
    });
  });
  test("toggling to timed anchors on the original date", () => {
    const e = { startsAt: "2026-07-15", endsAt: "2026-07-22", allDay: true };
    const d = editedDates(e, { allDay: false, time: "18:00" });
    expect(d.startsAt).toContain("2026-07-15T18:00");
    expect(d.endsAt).toBeUndefined();
  });
});
