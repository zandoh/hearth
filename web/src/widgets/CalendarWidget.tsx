import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { TimeInput, type ISOTimeString } from "@astryxdesign/core/TimeInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { TOPICS } from "../topics";
import { useMutate } from "../useMutate";
import { useTopicData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import {
  type CalEvent,
  type Calendar,
  createEvent,
  deleteEvent,
  updateEvent,
  eventOnDay,
  eventTimeLabel,
  getCalendars,
  getEvents,
  rfc3339Local,
  ymd,
} from "./calendarApi";
import { CalendarSettings } from "./CalendarSettings";
import { knownTags, eventTags, toggleTag } from "./eventTags";
import { getViews } from "../api";
import { assignLanes, hourRange, nowLine, placeEvent, timeAtFraction } from "./timeGrid";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalView = "month" | "week" | "workweek" | "day";

const VIEW_OPTIONS: { value: CalView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "workweek", label: "Work week" },
  { value: "day", label: "Day" },
];

const parseView = (v: unknown): CalView =>
  v === "week" || v === "workweek" || v === "day" ? v : "month";

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** The days visible for a non-month view, as YYYY-MM-DD. */
function visibleDays(view: CalView, anchor: Date): string[] {
  if (view === "day") return [ymd(anchor)];
  const sunday = addDays(anchor, -anchor.getDay());
  if (view === "workweek") {
    return Array.from({ length: 5 }, (_, i) => ymd(addDays(sunday, i + 1)));
  }
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(sunday, i)));
}

function viewTitle(view: CalView, anchor: Date, days: string[]): string {
  if (view === "month") {
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return anchor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }
  const first = new Date(`${days[0]}T12:00:00`);
  const last = new Date(`${days[days.length - 1]}T12:00:00`);
  const opts = { month: "short", day: "numeric" } as const;
  return `${first.toLocaleDateString([], opts)} – ${last.toLocaleDateString([], opts)}`;
}

interface DayCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
}

function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay()); // back to Sunday
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: ymd(d), dayOfMonth: d.getDate(), inMonth: d.getMonth() === month });
  }
  // Drop a trailing all-out-of-month week (Feb starting on Sunday etc.).
  return cells.slice(35).some((c) => c.inMonth) ? cells : cells.slice(0, 35);
}

export function CalendarWidget({ item, saveConfig }: WidgetProps) {
  const [view, setView] = useState<CalView>(() => parseView(item.config.view));
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<{ day: string; time?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cells = useMemo(
    () => (view === "month" ? monthGrid(anchor.getFullYear(), anchor.getMonth()) : []),
    [view, anchor],
  );
  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);

  // Fetch the whole visible range plus a day of slack on each side.
  const fetchVisibleEvents = useCallback(() => {
    const first = view === "month" ? cells[0].date : days[0];
    const last = view === "month" ? cells[cells.length - 1].date : days[days.length - 1];
    return getEvents(`${first}T00:00:00Z`, `${last}T23:59:59Z`);
  }, [view, cells, days]);
  const { data: eventsData, reload: reloadEvents } = useTopicData(
    TOPICS.calendar,
    fetchVisibleEvents,
  );
  const { data: calendarsData, reload: reloadCalendars } = useTopicData(
    TOPICS.calendar,
    getCalendars,
  );
  const events = eventsData ?? [];
  const calendars = calendarsData ?? [];
  const reload = useCallback(() => {
    reloadEvents();
    reloadCalendars();
  }, [reloadEvents, reloadCalendars]);

  const colorOf = useMemo(() => {
    const m = new Map((calendarsData ?? []).map((c) => [c.id, c.color]));
    return (calendarId: number) => m.get(calendarId) ?? "var(--color-icon-gray)";
  }, [calendarsData]);

  const today = ymd(new Date());
  const title = viewTitle(view, anchor, days);

  const shift = (dir: 1 | -1) => {
    if (view === "month") {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    } else if (view === "day") {
      setAnchor(addDays(anchor, dir));
    } else {
      setAnchor(addDays(anchor, dir * 7));
    }
  };

  const changeView = (v: CalView) => {
    setView(v);
    saveConfig?.({ ...item.config, view: v });
  };

  const unitLabel = view === "month" ? "month" : view === "day" ? "day" : "week";

  return (
    <VStack className="widget-body cal" gap={1.5}>
      <HStack justify="between" align="center" gap={2}>
        <Heading level={3} className="min-w-0">
          {title}
        </Heading>
        <HStack gap={0.5} align="center">
          <Selector
            label="Calendar view"
            isLabelHidden
            size="sm"
            value={view}
            options={VIEW_OPTIONS}
            onChange={(v) => changeView(parseView(v))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`Previous ${unitLabel}`}
            icon={<Icon icon="chevronLeft" size="sm" />}
            onClick={() => shift(-1)}
          />
          <Button size="sm" variant="ghost" label="Today" onClick={() => setAnchor(new Date())} />
          <IconButton
            size="sm"
            variant="ghost"
            label={`Next ${unitLabel}`}
            icon={<Icon icon="chevronRight" size="sm" />}
            onClick={() => shift(1)}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label="Calendar settings"
            icon={<Icon icon="wrench" size="sm" />}
            onClick={() => setSettingsOpen(true)}
          />
        </HStack>
      </HStack>

      {view === "month" && (
        <div className="cal-weekdays">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      )}

      {view !== "month" && (
        <TimeGrid
          days={days}
          events={events}
          today={today}
          colorOf={colorOf}
          onPickDay={(day, time) => setSelected({ day, time })}
        />
      )}

      {view === "month" && (
        <div className="cal-grid" style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}>
          {cells.map((cell) => {
            const dayEvents = events.filter((e) => eventOnDay(e, cell.date));
            return (
              <button
                key={cell.date}
                className={
                  "cal-day" +
                  (cell.inMonth ? "" : " out-month") +
                  (cell.date === today ? " today" : "")
                }
                onClick={() => setSelected({ day: cell.date })}
              >
                <span className="cal-day-num">{cell.dayOfMonth}</span>
                <span className="cal-day-events">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="cal-chip"
                      style={{ background: colorOf(e.calendarId) }}
                      title={e.title}
                    >
                      {e.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="cal-more">+{dayEvents.length - 3}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DayDialog
          day={selected.day}
          seedTime={selected.time}
          events={events.filter((e) => eventOnDay(e, selected.day))}
          calendars={calendars}
          colorOf={colorOf}
          onChanged={reload}
          onClose={() => setSelected(null)}
        />
      )}
      {settingsOpen && (
        <CalendarSettings onChanged={reload} onClose={() => setSettingsOpen(false)} />
      )}
    </VStack>
  );
}

function DayDialog({
  day,
  seedTime,
  events,
  calendars,
  colorOf,
  onChanged,
  onClose,
}: {
  day: string;
  // Time slot the user clicked in the grid: opens the add form pre-filled.
  seedTime?: string;
  events: CalEvent[];
  calendars: Calendar[];
  colorOf: (id: number) => string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const writable = calendars.filter((c) => c.enabled);
  const [formOpen, setFormOpen] = useState(!!seedTime);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState<number | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState((seedTime ?? "12:00") as ISOTimeString);
  const [notes, setNotes] = useState("");
  const { mutate, error } = useMutate(onChanged);

  // Tag pills: every tag the system watches (defaults + any widget's
  // configured list), so nobody has to remember the spelling.
  const [systemTags, setSystemTags] = useState<string[]>([]);
  useEffect(() => {
    getViews()
      .then((vs) => setSystemTags(knownTags(vs)))
      .catch(console.error);
  }, []);

  const resetForm = () => {
    setFormOpen(false);
    setEditing(null);
    setTitle("");
    setNotes("");
  };

  const startEdit = (e: CalEvent) => {
    setFormOpen(true);
    setEditing(e);
    setTitle(e.title);
    setCalendarId(e.calendarId);
    setAllDay(e.allDay);
    setNotes(e.notes ?? "");
    if (!e.allDay) {
      const d = new Date(e.startsAt);
      setTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` as ISOTimeString,
      );
    }
  };

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Editing must not reshape the event: keep its original start date and,
  // when the all-day flag is untouched, its original end — a week-long
  // all-day event edited for a typo stays week-long. Only toggling the
  // all-day switch falls back to the create-style one-day/one-hour default.
  const editedDates = (e: CalEvent) => {
    const baseDate = e.startsAt.slice(0, 10);
    if (allDay && e.allDay) return { startsAt: e.startsAt, endsAt: e.endsAt };
    if (!allDay && !e.allDay) {
      const startsAt = rfc3339Local(new Date(`${baseDate}T${time}:00`));
      const duration = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
      return {
        startsAt,
        endsAt:
          duration > 0
            ? rfc3339Local(new Date(new Date(startsAt).getTime() + duration))
            : undefined,
      };
    }
    return {
      startsAt: allDay ? baseDate : rfc3339Local(new Date(`${baseDate}T${time}:00`)),
      endsAt: undefined,
    };
  };

  const submit = () =>
    mutate(async () => {
      const calId = calendarId ?? writable[0]?.id;
      if (!calId || !title.trim()) throw new Error("pick a calendar and enter a title");
      const dates = editing
        ? editedDates(editing)
        : {
            startsAt: allDay ? day : rfc3339Local(new Date(`${day}T${time}:00`)),
            endsAt: undefined,
          };
      const input = {
        calendarId: calId,
        title: title.trim(),
        allDay,
        ...dates,
        notes: notes.trim(),
      };
      await (editing ? updateEvent(editing.id, input) : createEvent(input));
    }, resetForm);

  return (
    <Dialog isOpen width={480} onOpenChange={(open) => !open && onClose()}>
      <VStack gap={3} className="cal-dialog-body">
        <Heading level={2}>{dayLabel}</Heading>

        {events.length === 0 && !formOpen && <Text type="supporting">Nothing scheduled.</Text>}

        <VStack as="ul" gap={2} className="plain-list">
          {events.map((e) => (
            <HStack as="li" key={e.id} gap={2} align="center">
              <span className="cal-dot" style={{ background: colorOf(e.calendarId) }} />
              <Text type="supporting" hasTabularNumbers className="min-w-16">
                {eventTimeLabel(e)}
              </Text>
              <Text maxLines={1} className="flex-1">
                {e.title}
                {e.location ? ` · ${e.location}` : ""}
              </Text>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Edit ${e.title}`}
                icon={<Icon icon={Pencil} size="sm" />}
                onClick={() => startEdit(e)}
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={`Delete ${e.title}`}
                icon={<Icon icon="close" size="sm" />}
                onClick={() => mutate(() => deleteEvent(e.id))}
              />
            </HStack>
          ))}
        </VStack>

        {error && <Text className="form-error">{error}</Text>}

        {formOpen ? (
          <VStack gap={2}>
            <TextInput label="Title" value={title} onChange={(v) => setTitle(v)} onEnter={submit} />
            <Selector
              label="Calendar"
              value={String(calendarId ?? writable[0]?.id ?? "")}
              options={writable.map((c) => ({ value: String(c.id), label: c.name }))}
              onChange={(v) => setCalendarId(Number(v))}
            />
            <Switch label="All day" value={allDay} onChange={(checked) => setAllDay(checked)} />
            {!allDay && <TimeInput label="Time" value={time} onChange={(v) => v && setTime(v)} />}
            <TextArea
              label="Notes"
              isOptional
              rows={2}
              description="Hashtags here feed tag-driven widgets — tap a pill or type your own."
              value={notes}
              onChange={(v) => setNotes(v)}
            />
            {systemTags.length > 0 && (
              <HStack gap={1.5} wrap="wrap">
                {systemTags.map((tag) => {
                  const on = eventTags({ title, notes }).has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-pill no-drag${on ? " on" : ""}`}
                      onClick={() => setNotes(toggleTag(notes, tag))}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </HStack>
            )}
            <HStack justify="end" gap={2}>
              <Button size="sm" variant="ghost" label="Cancel" onClick={resetForm} />
              <Button
                size="sm"
                variant="primary"
                label={editing ? "Save changes" : "Add event"}
                onClick={submit}
              />
            </HStack>
          </VStack>
        ) : (
          <HStack justify="end" gap={2}>
            <IconButton
              size="sm"
              variant="secondary"
              label="Add event"
              tooltip="Add event"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={() => setFormOpen(true)}
            />
            <Button size="sm" variant="ghost" label="Close" onClick={onClose} />
          </HStack>
        )}
      </VStack>
    </Dialog>
  );
}

// The shared time-grid for week / work week / day: an hour gutter, events
// placed by their times (overlaps share the column via lanes), an all-day
// band, and a live now-line. All geometry comes from timeGrid.ts.
function TimeGrid({
  days,
  events,
  today,
  colorOf,
  onPickDay,
}: {
  days: string[];
  events: CalEvent[];
  today: string;
  colorOf: (id: number) => string;
  onPickDay: (day: string, time?: string) => void;
}) {
  // The now-line creeps; re-render once a minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const range = hourRange(events, days);
  const hours = [];
  for (let h = range.startHour; h < range.endHour; h++) hours.push(h);
  const hourLabel = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });
  const anyAllDay = days.some((d) => events.some((e) => e.allDay && eventOnDay(e, d)));

  return (
    <div className="cal-tg" style={{ "--tg-cols": days.length } as React.CSSProperties}>
      <div className="cal-tg-row cal-tg-heads">
        <span />
        {days.map((d) => {
          const date = new Date(`${d}T12:00:00`);
          return (
            <button
              key={d}
              className={`cal-tg-head no-drag${d === today ? " today" : ""}`}
              onClick={() => onPickDay(d)}
            >
              {date.toLocaleDateString([], { weekday: "short" })} <strong>{date.getDate()}</strong>
            </button>
          );
        })}
      </div>

      {anyAllDay && (
        <div className="cal-tg-row cal-tg-allday">
          <span className="cal-tg-gutter-label">all day</span>
          {days.map((d) => (
            <button key={d} className="cal-tg-allday-cell no-drag" onClick={() => onPickDay(d)}>
              {events
                .filter((e) => e.allDay && eventOnDay(e, d))
                .map((e) => (
                  <span
                    key={e.id}
                    className="cal-tg-chip"
                    style={{ borderLeftColor: colorOf(e.calendarId) }}
                  >
                    {e.title}
                  </span>
                ))}
            </button>
          ))}
        </div>
      )}

      <div className="cal-tg-row cal-tg-body">
        <div className="cal-tg-gutter">
          {hours.map((h) => (
            <span key={h} style={{ top: `${((h - range.startHour) / hours.length) * 100}%` }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const lanes = assignLanes(events.filter((e) => placeEvent(e, d, range) !== null));
          const line = nowLine(now, d, range);
          return (
            <button
              key={d}
              className={`cal-tg-col no-drag${d === today ? " today" : ""}`}
              style={{ "--tg-rows": hours.length } as React.CSSProperties}
              onClick={(e) => {
                // Clicking an event opens the day plainly; clicking an empty
                // slot seeds the add form with that slot's time.
                if ((e.target as HTMLElement).closest(".cal-tg-event")) {
                  onPickDay(d);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                onPickDay(d, timeAtFraction(range, (e.clientY - rect.top) / rect.height));
              }}
            >
              {events.map((e) => {
                const pos = placeEvent(e, d, range);
                if (!pos) return null;
                const lane = lanes.get(e.id) ?? { lane: 0, lanes: 1 };
                return (
                  <span
                    key={e.id}
                    className="cal-tg-event"
                    style={{
                      top: `${pos.top}%`,
                      height: `${pos.height}%`,
                      left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lane.lanes}% - 4px)`,
                      borderLeftColor: colorOf(e.calendarId),
                    }}
                  >
                    <span className="cal-tg-event-time">
                      {new Date(e.startsAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="cal-tg-event-title">{e.title}</span>
                  </span>
                );
              })}
              {line !== null && <span className="cal-tg-now" style={{ top: `${line}%` }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
