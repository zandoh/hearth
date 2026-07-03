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
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import { type CountdownItem, daysUntil, parseItems, upcoming } from "./countdown";

// The big days the household is waiting for — weddings, trips, birthdays —
// as "N days" cards, soonest first. Past dates simply stop showing.

export function CountdownWidget({ item }: WidgetProps) {
  const now = new Date();
  const items = upcoming(parseItems(item.config.items), now);

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
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, items })}
        />
      </HStack>
    </VStack>
  );
}
