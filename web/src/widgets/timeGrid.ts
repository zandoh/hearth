// Geometry for the calendar's time-grid views (week / work week / day):
// which hours to show, where each event sits vertically, and how
// overlapping events share a column. Pure math, unit-tested; the widget
// only renders the results.

export interface GridEvent {
  id: number;
  startsAt: string; // RFC3339, or YYYY-MM-DD when allDay
  endsAt: string;
  allDay: boolean;
}

export interface HourRange {
  startHour: number;
  endHour: number; // exclusive; endHour - startHour = rows
}

// The waking-day default; events outside it stretch the range.
const DEFAULT_START = 7;
const DEFAULT_END = 21;

/** Visible hour range covering all timed events on the given days. */
export function hourRange(events: GridEvent[], days: string[]): HourRange {
  let start = DEFAULT_START;
  let end = DEFAULT_END;
  const daySet = new Set(days);
  for (const e of events) {
    if (e.allDay) continue;
    const s = new Date(e.startsAt);
    const en = new Date(e.endsAt);
    if (!daySet.has(ymdLocal(s)) && !daySet.has(ymdLocal(en))) continue;
    start = Math.min(start, s.getHours());
    end = Math.max(end, en.getHours() + (en.getMinutes() > 0 ? 1 : 0));
  }
  return { startHour: Math.max(0, start), endHour: Math.min(24, Math.max(end, start + 1)) };
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface Placement {
  top: number; // % of the grid body
  height: number; // %
}

/**
 * Vertical placement of a timed event within one day column, clipped to the
 * day and the visible range. Null when the event doesn't touch this day.
 */
export function placeEvent(e: GridEvent, day: string, range: HourRange): Placement | null {
  if (e.allDay) return null;
  const dayStart = new Date(`${day}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  if (end <= dayStart || start >= dayEnd) return null;

  const rangeStart = new Date(dayStart).setHours(range.startHour, 0, 0, 0);
  const total = (range.endHour - range.startHour) * 3_600_000;
  const from = Math.max(start.getTime(), rangeStart);
  const to = Math.min(end.getTime(), new Date(dayStart).setHours(range.endHour, 0, 0, 0));
  if (to <= rangeStart) return null;

  const top = Math.max(0, ((from - rangeStart) / total) * 100);
  const height = Math.max(3.5, ((to - from) / total) * 100 - 0.4);
  if (top >= 100) return null;
  return { top, height: Math.min(height, 100 - top) };
}

export interface Lane {
  lane: number;
  lanes: number; // width divisor for the event's collision cluster
}

/**
 * Overlapping events share the column side by side: greedy first-free-lane
 * assignment, with every member of a collision cluster divided by the
 * cluster's widest moment.
 */
export function assignLanes(events: GridEvent[]): Map<number, Lane> {
  const timed = events
    .filter((e) => !e.allDay)
    .map((e) => ({ id: e.id, start: Date.parse(e.startsAt), end: Date.parse(e.endsAt) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out = new Map<number, Lane>();
  let cluster: { id: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const m of cluster) out.set(m.id, { lane: m.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const e of timed) {
    if (e.start >= clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.end);
    } else {
      laneEnds[lane] = e.end;
    }
    cluster.push({ id: e.id, lane });
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  closeCluster();
  return out;
}

/** The now-line position as a % of the grid body, or null when outside. */
export function nowLine(now: Date, day: string, range: HourRange): number | null {
  if (ymdLocal(now) !== day) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = range.startHour * 60;
  const to = range.endHour * 60;
  if (minutes < from || minutes > to) return null;
  return ((minutes - from) / (to - from)) * 100;
}

/** The HH:MM at a vertical fraction of the grid body, floored to :00/:30. */
export function timeAtFraction(range: HourRange, fraction: number): string {
  const minutes =
    (range.startHour + Math.min(Math.max(fraction, 0), 1) * (range.endHour - range.startHour)) * 60;
  const snapped = Math.min(Math.floor(minutes / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
}
