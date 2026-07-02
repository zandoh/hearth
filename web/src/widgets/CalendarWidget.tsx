import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";
import {
  type CalEvent,
  type Calendar,
  createEvent,
  deleteEvent,
  eventOnDay,
  eventTimeLabel,
  getCalendars,
  getEvents,
  rfc3339Local,
  ymd,
} from "./calendarApi";
import { CalendarSettings } from "./CalendarSettings";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export function CalendarWidget(_props: WidgetProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);

  const reload = useCallback(() => {
    // Fetch the whole visible grid plus a day of slack on each side.
    const start = `${cells[0].date}T00:00:00Z`;
    const last = cells[cells.length - 1].date;
    getEvents(start, `${last}T23:59:59Z`).then(setEvents).catch(console.error);
    getCalendars().then(setCalendars).catch(console.error);
  }, [cells]);

  useEffect(reload, [reload]);
  useTopic("calendar", reload);

  const colorOf = useMemo(() => {
    const m = new Map(calendars.map((c) => [c.id, c.color]));
    return (calendarId: number) => m.get(calendarId) ?? "var(--color-icon-gray)";
  }, [calendars]);

  const today = ymd(new Date());
  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <VStack className="widget-body cal" gap={1.5}>
      <HStack justify="between" align="center">
        <Heading level={3}>{monthName}</Heading>
        <HStack gap={0.5}>
          <Button size="sm" variant="ghost" label="‹" onClick={() => shiftMonth(-1)} />
          <Button
            size="sm"
            variant="ghost"
            label="Today"
            onClick={() => {
              const now = new Date();
              setCursor({ year: now.getFullYear(), month: now.getMonth() });
            }}
          />
          <Button size="sm" variant="ghost" label="›" onClick={() => shiftMonth(1)} />
          <Button size="sm" variant="ghost" label="⚙" onClick={() => setSettingsOpen(true)} />
        </HStack>
      </HStack>

      <div className="cal-weekdays">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

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
              onClick={() => setSelectedDay(cell.date)}
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
                {dayEvents.length > 3 && <span className="cal-more">+{dayEvents.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <DayDialog
          day={selectedDay}
          events={events.filter((e) => eventOnDay(e, selectedDay))}
          calendars={calendars}
          colorOf={colorOf}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {settingsOpen && <CalendarSettings onClose={() => setSettingsOpen(false)} />}
    </VStack>
  );
}

function DayDialog({
  day,
  events,
  calendars,
  colorOf,
  onClose,
}: {
  day: string;
  events: CalEvent[];
  calendars: Calendar[];
  colorOf: (id: number) => string;
  onClose: () => void;
}) {
  const writable = calendars.filter((c) => c.enabled);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState<number | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState("12:00");
  const [error, setError] = useState("");

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const submit = async () => {
    const calId = calendarId ?? writable[0]?.id;
    if (!calId || !title.trim()) {
      setError("pick a calendar and enter a title");
      return;
    }
    try {
      await createEvent({
        calendarId: calId,
        title: title.trim(),
        allDay,
        startsAt: allDay ? day : rfc3339Local(new Date(`${day}T${time}:00`)),
      });
      setAdding(false);
      setTitle("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save");
    }
  };

  return (
    <Dialog isOpen width={480} onOpenChange={(open) => !open && onClose()}>
      <VStack gap={3} className="cal-dialog-body">
        <Heading level={2}>{dayLabel}</Heading>

        {events.length === 0 && !adding && <Text type="supporting">Nothing scheduled.</Text>}

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
              <Button
                size="sm"
                variant="ghost"
                label="✕"
                onClick={() => deleteEvent(e.id).catch(console.error)}
              />
            </HStack>
          ))}
        </VStack>

        {adding ? (
          <VStack gap={2}>
            <TextInput label="Title" value={title} onChange={(v) => setTitle(v)} onEnter={submit} />
            <label className="cal-field">
              <Text type="supporting">Calendar</Text>
              <select
                value={calendarId ?? writable[0]?.id ?? ""}
                onChange={(e) => setCalendarId(Number(e.target.value))}
              >
                {writable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Switch label="All day" value={allDay} onChange={(checked) => setAllDay(checked)} />
            {!allDay && (
              <label className="cal-field">
                <Text type="supporting">Time</Text>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            )}
            {error && <Text className="form-error">{error}</Text>}
            <HStack justify="end" gap={2}>
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setAdding(false)} />
              <Button size="sm" variant="primary" label="Add event" onClick={submit} />
            </HStack>
          </VStack>
        ) : (
          <HStack justify="end" gap={2}>
            <Button
              size="sm"
              variant="secondary"
              label="+ Add event"
              onClick={() => setAdding(true)}
            />
            <Button size="sm" variant="ghost" label="Close" onClick={onClose} />
          </HStack>
        )}
      </VStack>
    </Dialog>
  );
}
