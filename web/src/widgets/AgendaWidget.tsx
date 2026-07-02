import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";
import {
  type CalEvent,
  type Calendar,
  eventOnDay,
  eventTimeLabel,
  getCalendars,
  getEvents,
  ymd,
} from "./calendarApi";

const DAYS_AHEAD = 7;

// "What's coming up" — the same event feed as the month widget, as a list.
export function AgendaWidget(_props: WidgetProps) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);

  const reload = useCallback(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + DAYS_AHEAD);
    getEvents(`${ymd(start)}T00:00:00Z`, `${ymd(end)}T23:59:59Z`)
      .then(setEvents)
      .catch(console.error);
    getCalendars().then(setCalendars).catch(console.error);
  }, []);

  useEffect(reload, [reload]);
  useTopic("calendar", reload);

  const colorOf = (calendarId: number) =>
    calendars.find((c) => c.id === calendarId)?.color ?? "var(--color-icon-gray)";

  const days: { date: string; label: string; events: CalEvent[] }[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const date = ymd(d);
    const dayEvents = events.filter((e) => eventOnDay(e, date));
    if (dayEvents.length === 0) continue;
    days.push({
      date,
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }),
      events: dayEvents,
    });
  }

  return (
    <VStack className="widget-body" gap={3}>
      <Text type="label">Coming up</Text>
      {days.length === 0 && (
        <EmptyState
          isCompact
          title="All clear"
          description={`Nothing scheduled in the next ${DAYS_AHEAD} days.`}
        />
      )}
      {days.map((day) => (
        <VStack key={day.date} gap={1}>
          <Text type="supporting" size="xsm">
            {day.label.toUpperCase()}
          </Text>
          {day.events.map((e) => (
            <HStack key={`${day.date}-${e.id}`} gap={2} align="center">
              <span className="cal-dot" style={{ background: colorOf(e.calendarId) }} />
              <Text type="supporting" hasTabularNumbers className="min-w-16">
                {eventTimeLabel(e)}
              </Text>
              <Text maxLines={1}>{e.title}</Text>
            </HStack>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}
