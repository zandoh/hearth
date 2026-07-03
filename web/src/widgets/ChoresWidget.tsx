import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useConfirm } from "../confirm";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";

interface Chore {
  id: number;
  title: string;
  everyDays: number;
  lastDone?: string;
  dueOn: string;
  dueIn: number; // negative = overdue
  neverDone: boolean;
}

const api = "/api/widgets/chores";

export function ChoresWidget(_props: WidgetProps) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [everyDays, setEveryDays] = useState(7);
  const { confirm, confirmDialog } = useConfirm();

  const reload = useCallback(() => {
    fetch(api)
      .then((r) => r.json())
      .then((list: Chore[]) => setChores(list.sort((a, b) => a.dueIn - b.dueIn)))
      .catch(console.error);
  }, []);

  useEffect(reload, [reload]);
  useTopic("chores", reload);

  const complete = (id: number) =>
    fetch(`${api}/${id}/complete`, { method: "POST" }).catch(console.error);

  const remove = (id: number, name: string) =>
    confirm(
      {
        title: `Delete "${name}"?`,
        description: "The chore and its completion history will be deleted.",
        actionLabel: "Delete",
      },
      () => fetch(`${api}/${id}`, { method: "DELETE" }).catch(console.error),
    );

  const add = async () => {
    if (!title.trim()) return;
    await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), everyDays }),
    }).catch(console.error);
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
        <HStack gap={2} align="end" wrap="wrap">
          <TextInput
            label="Chore"
            isLabelHidden
            placeholder="Chore name"
            value={title}
            onChange={(v) => setTitle(v)}
            onEnter={add}
            className="min-w-0 flex-1"
          />
          <NumberInput
            label="Every N days"
            isLabelHidden
            min={1}
            value={everyDays}
            onChange={(v) => setEveryDays(Math.max(1, v ?? 1))}
            className="w-24"
          />
          <Button size="sm" variant="primary" label="Add" onClick={add} />
        </HStack>
      )}

      <VStack as="ul" gap={2} className="plain-list">
        {chores.map((c) => (
          <HStack as="li" key={c.id} gap={2} align="center">
            <button
              className="chore-check no-drag"
              title="Mark done"
              onClick={() => complete(c.id)}
            >
              ✓
            </button>
            <Text maxLines={1} className="flex-1">
              {c.title}
            </Text>
            {c.dueIn < 0 && <Badge variant="error" label={`${-c.dueIn}d overdue`} />}
            {c.dueIn === 0 && <Badge variant="warning" label="Due today" />}
            {c.dueIn > 0 && <Text type="supporting">in {c.dueIn}d</Text>}
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
      {chores.length === 0 && <EmptyState isCompact title="No chores" description="Lucky you." />}
      {confirmDialog}
    </VStack>
  );
}
