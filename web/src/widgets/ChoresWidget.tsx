import { useMemo, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useConfirm } from "../confirm";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";

interface Chore {
  id: number;
  title: string;
  everyDays: number; // 0 = one-off: done once, then gone
  lastDone?: string;
  dueOn: string;
  dueIn: number; // negative = overdue
  neverDone: boolean;
  oneOff: boolean;
}

const api = "/api/widgets/chores";

// Starter ideas for recurring upkeep — household routines plus the "life
// things" that are easy to forget until they're a problem.
const SUGGESTIONS: { title: string; everyDays: number }[] = [
  { title: "Water plants", everyDays: 3 },
  { title: "Wash bed sheets", everyDays: 7 },
  { title: "Vacuum", everyDays: 7 },
  { title: "Clean bathrooms", everyDays: 7 },
  { title: "Mow the lawn", everyDays: 7 },
  { title: "Wash pillows", everyDays: 90 },
  { title: "Replace furnace filter", everyDays: 90 },
  { title: "Descale coffee maker", everyDays: 60 },
  { title: "Clean fridge", everyDays: 30 },
  { title: "Deep clean oven", everyDays: 90 },
  { title: "Test smoke detectors", everyDays: 180 },
  { title: "Clean dryer vent", everyDays: 180 },
  { title: "Clean gutters", everyDays: 180 },
  { title: "Car oil change", everyDays: 180 },
  { title: "Rotate tires", everyDays: 180 },
  { title: "HVAC service", everyDays: 365 },
  { title: "Flush water heater", everyDays: 365 },
  { title: "Car registration", everyDays: 365 },
];

export function ChoresWidget(_props: WidgetProps) {
  const { data } = useWidgetData<Chore[]>("chores");
  const chores = useMemo(() => [...(data ?? [])].sort((a, b) => a.dueIn - b.dueIn), [data]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [repeats, setRepeats] = useState(true);
  const [everyDays, setEveryDays] = useState(7);
  const { confirm, confirmDialog } = useConfirm();

  const existing = useMemo(() => new Set(chores.map((c) => c.title.toLowerCase())), [chores]);
  const suggestions = SUGGESTIONS.filter((s) => !existing.has(s.title.toLowerCase()));

  const complete = (id: number) =>
    apiFetch(`${api}/${id}/complete`, { method: "POST" }).catch(console.error);

  const remove = (id: number, name: string) =>
    confirm(
      {
        title: `Delete "${name}"?`,
        description: "The chore and its completion history will be deleted.",
        actionLabel: "Delete",
      },
      () => apiFetch(`${api}/${id}`, { method: "DELETE" }).catch(console.error),
    );

  const create = async (name: string, interval: number) => {
    await apiFetch(api, {
      method: "POST",
      body: JSON.stringify({ title: name, everyDays: interval }),
    }).catch(console.error);
  };

  const add = async () => {
    if (!title.trim()) return;
    await create(title.trim(), repeats ? everyDays : 0);
    setTitle("");
    setAdding(false);
  };

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="end">
        <Button
          size="sm"
          variant="ghost"
          label={adding ? "×" : "+ Add"}
          onClick={() => setAdding(!adding)}
        />
      </HStack>

      {adding && (
        <VStack gap={2}>
          <HStack gap={2} align="end" wrap="wrap">
            <TextInput
              label="Chore"
              isLabelHidden
              placeholder={repeats ? "Chore name" : "e.g. Call mom"}
              value={title}
              onChange={(v) => setTitle(v)}
              onEnter={add}
              className="min-w-0 flex-1"
            />
            {repeats && (
              <NumberInput
                label="Every N days"
                isLabelHidden
                min={1}
                value={everyDays}
                onChange={(v) => setEveryDays(Math.max(1, v ?? 1))}
                className="w-24"
              />
            )}
            <Button size="sm" variant="primary" label="Add" onClick={add} />
          </HStack>
          <Switch
            label="Repeats"
            description={
              repeats
                ? `Comes back every ${everyDays} days`
                : "One-time to-do — disappears when done"
            }
            value={repeats}
            onChange={setRepeats}
          />
          {suggestions.length > 0 && (
            <VStack gap={1}>
              <Text type="supporting" size="xsm">
                SUGGESTIONS
              </Text>
              <HStack gap={1.5} wrap="wrap">
                {suggestions.slice(0, 8).map((s) => (
                  <button
                    key={s.title}
                    className="palette-chip no-drag"
                    title={`every ${s.everyDays} days`}
                    onClick={() => {
                      setTitle(s.title);
                      setRepeats(true);
                      setEveryDays(s.everyDays);
                    }}
                  >
                    {s.title} · {s.everyDays}d
                  </button>
                ))}
              </HStack>
            </VStack>
          )}
        </VStack>
      )}

      <VStack as="ul" gap={2} className="plain-list">
        {chores.map((c) => (
          <HStack as="li" key={c.id} gap={2} align="center">
            <button
              className="chore-check no-drag"
              title={c.oneOff ? "Done — remove from list" : "Mark done"}
              onClick={() => complete(c.id)}
            >
              ✓
            </button>
            <VStack gap={0} className="min-w-0 flex-1">
              <Text maxLines={1}>{c.title}</Text>
              {!c.oneOff && (
                <Text type="supporting" size="xsm">
                  every {c.everyDays}d
                </Text>
              )}
            </VStack>
            {c.oneOff && <Badge variant="neutral" label="To-do" />}
            {!c.oneOff && c.dueIn < 0 && <Badge variant="error" label={`${-c.dueIn}d overdue`} />}
            {!c.oneOff && c.dueIn === 0 && <Badge variant="warning" label="Due today" />}
            {!c.oneOff && c.dueIn > 0 && <Text type="supporting">in {c.dueIn}d</Text>}
            <IconButton
              size="sm"
              variant="ghost"
              label={`Delete ${c.title}`}
              icon={<Icon icon="close" size="sm" />}
              onClick={() => remove(c.id, c.title)}
            />
          </HStack>
        ))}
      </VStack>
      {chores.length === 0 && !adding && (
        <EmptyState isCompact title="No chores" description="Lucky you." />
      )}
      {confirmDialog}
    </VStack>
  );
}
