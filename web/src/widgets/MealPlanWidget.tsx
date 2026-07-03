import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";
import { ymd } from "./calendarApi";

interface Entry {
  day: string;
  slot: string;
  text: string;
}

const api = "/api/widgets/mealplan";
const SLOTS = ["breakfast", "lunch", "dinner"] as const;
const SLOT_LABEL: Record<string, string> = { breakfast: "B", lunch: "L", dinner: "D" };

const sundayOf = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function MealPlanWidget(_props: WidgetProps) {
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<{ day: string; slot: string; text: string } | null>(null);

  const startYmd = ymd(weekStart);
  const reload = useCallback(() => {
    apiFetch<{ entries: Entry[] }>(`${api}/week?start=${startYmd}`)
      .then((d) => setEntries(d.entries))
      .catch(console.error);
  }, [startYmd]);

  useEffect(reload, [reload]);
  useTopic("mealplan", reload);

  const entryFor = (day: string, slot: string) =>
    entries.find((e) => e.day === day && e.slot === slot)?.text ?? "";

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = ymd(new Date());
  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  const save = async () => {
    if (!editing) return;
    await apiFetch(`${api}/entry`, {
      method: "PUT",
      body: JSON.stringify(editing),
    }).catch(console.error);
    setEditing(null);
  };

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="between" align="center">
        <Text type="label">{weekLabel}</Text>
        <HStack gap={0.5}>
          <IconButton
            size="sm"
            variant="ghost"
            label="Previous week"
            icon={<Icon icon="chevronLeft" size="sm" />}
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          />
          <Button
            size="sm"
            variant="ghost"
            label="This week"
            onClick={() => setWeekStart(sundayOf(new Date()))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label="Next week"
            icon={<Icon icon="chevronRight" size="sm" />}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          />
        </HStack>
      </HStack>

      <div className="meal-grid">
        <span />
        {SLOTS.map((s) => (
          <Text key={s} type="supporting" size="xsm" justify="center">
            {SLOT_LABEL[s]}
          </Text>
        ))}
        {days.map((d) => {
          const day = ymd(d);
          return [
            <Text
              key={`${day}-label`}
              type="supporting"
              size="xsm"
              className={day === today ? "meal-today" : undefined}
            >
              {d.toLocaleDateString([], { weekday: "short" })}
            </Text>,
            ...SLOTS.map((slot) => {
              const text = entryFor(day, slot);
              return (
                <button
                  key={`${day}-${slot}`}
                  className={`meal-cell no-drag${text ? " filled" : ""}${day === today ? " today" : ""}`}
                  onClick={() => setEditing({ day, slot, text })}
                >
                  {text || "·"}
                </button>
              );
            }),
          ];
        })}
      </div>

      {editing && (
        <Dialog isOpen width={420} onOpenChange={(open) => !open && setEditing(null)}>
          <VStack gap={3} className="cal-dialog-body">
            <Heading level={2}>
              {new Date(`${editing.day}T12:00:00`).toLocaleDateString([], {
                weekday: "long",
              })}{" "}
              {editing.slot}
            </Heading>
            <TextInput
              label="Meal"
              placeholder="e.g. Tacos"
              value={editing.text}
              onChange={(v) => setEditing({ ...editing, text: v })}
              onEnter={save}
              hasClear
            />
            <HStack justify="end" gap={2}>
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setEditing(null)} />
              <Button size="sm" variant="primary" label="Save" onClick={save} />
            </HStack>
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
