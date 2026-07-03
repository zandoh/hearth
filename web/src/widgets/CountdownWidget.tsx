import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { TOPICS } from "../topics";
import { useTopicData } from "../useWidgetData";
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import { getEvents, ymd } from "./calendarApi";
import {
  DEFAULT_TAGS,
  type CountdownItem,
  daysUntil,
  fromCalendar,
  parseItems,
  upcoming,
} from "./countdown";
import { parseTagList } from "./eventTags";

// The big days the household is waiting for — weddings, trips, birthdays —
// as "N days" cards, soonest first. Past dates simply stop showing. Manual
// entries live in the widget config; calendar events join automatically
// when tagged #countdown / #travel / … in their description or title
// (see eventTags.ts — the tag convention is shared, not countdown-only).

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const fetchYearAhead = () => {
  const today = new Date();
  return getEvents(`${ymd(today)}T00:00:00Z`, `${ymd(addDays(today, 365))}T23:59:59Z`);
};

export function CountdownWidget({ item }: WidgetProps) {
  const now = new Date();
  const { data } = useTopicData(TOPICS.calendar, fetchYearAhead);
  const events = data ?? [];

  const tags = parseTagList(item.config.tags);
  const tagged = fromCalendar(events, tags.length > 0 ? tags : DEFAULT_TAGS, now);
  const manual = parseItems(item.config.items);
  // Manual entry wins over a same-labeled calendar event.
  const manualLabels = new Set(manual.map((m) => m.label.toLowerCase()));
  const items = upcoming(
    [...manual, ...tagged.filter((t) => !manualLabels.has(t.label.toLowerCase()))],
    now,
  );

  if (items.length === 0) {
    return (
      <VStack className="widget-body" justify="center">
        <EmptyState
          isCompact
          title="Nothing counting down"
          description="Add the big days in this widget's settings."
        />
      </VStack>
    );
  }

  return (
    <VStack className="widget-body" gap={2}>
      {items.map((it) => {
        const days = daysUntil(it.date, now);
        return (
          <HStack key={`${it.date}-${it.label}`} gap={3} align="center" className="countdown-row">
            <span className="countdown-days brand-data">
              {days === 0 ? "today" : days}
              {days > 0 && <span className="countdown-unit">{days === 1 ? "day" : "days"}</span>}
            </span>
            <VStack gap={0} className="min-w-0 flex-1">
              <Text maxLines={1}>{it.label}</Text>
              <Text type="supporting" size="xsm">
                {new Date(`${it.date}T12:00:00`).toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </VStack>
          </HStack>
        );
      })}
    </VStack>
  );
}

export function CountdownSettings({ config, save }: WidgetSettingsProps) {
  const [items, setItems] = useState<CountdownItem[]>(() => parseItems(config.items));
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [tagsText, setTagsText] = useState(() => {
    const configured = parseTagList(config.tags);
    return (configured.length > 0 ? configured : DEFAULT_TAGS).join(", ");
  });

  const add = () => {
    if (!label.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setItems([...items, { label: label.trim(), date }]);
    setLabel("");
    setDate("");
  };

  return (
    <VStack gap={3}>
      <VStack as="ul" gap={2} className="plain-list">
        {items.map((it, i) => (
          <HStack as="li" key={`${it.date}-${it.label}`} gap={2} align="center">
            <Text className="min-w-0 flex-1" maxLines={1}>
              {it.label}
            </Text>
            <Text type="supporting">{it.date}</Text>
            <IconButton
              size="sm"
              variant="ghost"
              label={`Remove ${it.label}`}
              icon={<Icon icon="close" size="sm" />}
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
            />
          </HStack>
        ))}
      </VStack>
      <HStack gap={2} align="end" wrap="wrap">
        <TextInput
          label="Event"
          placeholder="e.g. Beach trip"
          value={label}
          onChange={setLabel}
          onEnter={add}
          className="min-w-0 flex-1"
        />
        <input
          type="date"
          className="countdown-date no-drag"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <IconButton
          size="sm"
          variant="secondary"
          label="Add countdown"
          tooltip="Add"
          icon={<Icon icon={Plus} size="sm" />}
          onClick={add}
        />
      </HStack>
      <TextInput
        label="Calendar tags"
        description="Calendar events tagged with any of these (as #hashtags in the event's description or title) count down automatically."
        value={tagsText}
        onChange={setTagsText}
      />
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, items, tags: parseTagList(tagsText) })}
        />
      </HStack>
    </VStack>
  );
}
