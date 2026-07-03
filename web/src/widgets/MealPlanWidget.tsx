import { useCallback, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { TOPICS } from "../topics";
import { useMutate } from "../useMutate";
import { useTopicData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import { ymd } from "./calendarApi";
import { type MealEntry, getWeek, saveEntry } from "./mealplanApi";

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
  const [editing, setEditing] = useState<MealEntry | null>(null);

  const startYmd = ymd(weekStart);
  const fetchWeek = useCallback(() => getWeek(startYmd), [startYmd]);
  const { data, reload } = useTopicData(TOPICS.mealplan, fetchWeek);
  const entries = data?.entries ?? [];
  const { mutate, error } = useMutate(reload);

  const entryFor = (day: string, slot: string) =>
    entries.find((e) => e.day === day && e.slot === slot)?.text ?? "";

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = ymd(new Date());
  const weekLabel = `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  const save = () => {
    if (!editing) return;
    // The dialog closes only on success; a failure keeps it open with the
    // server's message.
    mutate(
      () => saveEntry(editing),
      () => setEditing(null),
    );
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
            {error && <Text className="form-error">{error}</Text>}
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
