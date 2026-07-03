import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Avatar } from "../Avatar";
import { useConfirm } from "../confirm";
import { useMutate } from "../useMutate";
import { useProfiles } from "../profiles";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import { type Chore, addChore, completeChore, deleteChore } from "./choresApi";

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
  const { data, reload } = useWidgetData<Chore[]>("chores");
  const chores = useMemo(() => [...(data ?? [])].sort((a, b) => a.dueIn - b.dueIn), [data]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [repeats, setRepeats] = useState(true);
  const [everyDays, setEveryDays] = useState(7);
  const [assignee, setAssignee] = useState("0");
  const { profiles } = useProfiles();
  const { confirm, confirmDialog } = useConfirm();
  const { mutate, error } = useMutate(reload);
  const profileOf = (id?: number) => profiles.find((p) => p.id === id);

  const existing = useMemo(() => new Set(chores.map((c) => c.title.toLowerCase())), [chores]);
  const suggestions = SUGGESTIONS.filter((s) => !existing.has(s.title.toLowerCase()));

  const complete = (id: number) => mutate(() => completeChore(id));

  const remove = (id: number, name: string) =>
    confirm(
      {
        title: `Delete "${name}"?`,
        description: "The chore and its completion history will be deleted.",
        actionLabel: "Delete",
      },
      () => mutate(() => deleteChore(id)),
    );

  const add = () => {
    if (!title.trim()) return;
    mutate(
      () => addChore(title.trim(), repeats ? everyDays : 0, Number(assignee)),
      () => {
        setTitle("");
        setAdding(false);
      },
    );
  };

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="end">
        <IconButton
          size="sm"
          variant="ghost"
          label={adding ? "Cancel" : "Add chore"}
          tooltip={adding ? "Cancel" : "Add chore"}
          icon={<Icon icon={adding ? "close" : Plus} size="sm" />}
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
            {profiles.length > 0 && (
              <Selector
                label="Assignee"
                isLabelHidden
                size="sm"
                value={assignee}
                options={[
                  { value: "0", label: "Anyone" },
                  ...profiles.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
                onChange={setAssignee}
              />
            )}
            <IconButton
              size="sm"
              variant="primary"
              label="Add chore"
              tooltip="Add chore"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={add}
            />
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

      {error && <Text className="form-error">{error}</Text>}

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
            {profileOf(c.assigneeId) && <Avatar profile={profileOf(c.assigneeId)!} />}
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
