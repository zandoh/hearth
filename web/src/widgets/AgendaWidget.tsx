import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useTopic } from "../useSSE";
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import {
  type CalEvent,
  type Calendar,
  eventOnDay,
  eventTimeLabel,
  getCalendars,
  getEvents,
  ymd,
} from "./calendarApi";

const DEFAULT_DAYS_AHEAD = 7;

const daysAheadFrom = (config: Record<string, unknown>): number => {
  const n = Number(config.daysAhead);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? n : DEFAULT_DAYS_AHEAD;
};

// "What's coming up" — the same event feed as the month widget, as a list.
export function AgendaWidget({ item }: WidgetProps) {
  const DAYS_AHEAD = daysAheadFrom(item.config);
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
  }, [DAYS_AHEAD]);

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

export function AgendaSettings({ config, save }: WidgetSettingsProps) {
  const [days, setDays] = useState(daysAheadFrom(config));

  return (
    <VStack gap={3}>
      <NumberInput
        label="Days ahead"
        min={1}
        max={30}
        value={days}
        onChange={(v) => setDays(Math.min(30, Math.max(1, v ?? DEFAULT_DAYS_AHEAD)))}
      />
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, daysAhead: days })}
        />
      </HStack>
    </VStack>
  );
}
