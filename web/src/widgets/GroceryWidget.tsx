import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";

interface Item {
  id: number;
  name: string;
  checked: boolean;
}

const api = "/api/widgets/grocery";

export function GroceryWidget(_props: WidgetProps) {
  const { data } = useWidgetData<Item[]>("grocery");
  const items = data ?? [];
  const [name, setName] = useState("");

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName("");
    await apiFetch(api, { method: "POST", body: JSON.stringify({ name: trimmed }) }).catch(
      console.error,
    );
  };

  const toggle = (id: number) =>
    apiFetch(`${api}/${id}/toggle`, { method: "POST" }).catch(console.error);

  const clearDone = () => apiFetch(`${api}/clear-checked`, { method: "POST" }).catch(console.error);

  const doneCount = items.filter((i) => i.checked).length;

  return (
    <VStack className="widget-body" gap={2}>
      {doneCount > 0 && (
        <HStack justify="end">
          <Button size="sm" variant="ghost" label={`Clear ${doneCount} done`} onClick={clearDone} />
        </HStack>
      )}

      <HStack gap={2} align="end">
        <TextInput
          label="Add item"
          isLabelHidden
          placeholder="Add item…"
          value={name}
          onChange={(v) => setName(v)}
          onEnter={add}
          className="min-w-0 flex-1"
        />
        <Button size="sm" variant="secondary" label="Add" onClick={add} />
      </HStack>

      <VStack as="ul" gap={1.5} className="plain-list">
        {items.map((it) => (
          <HStack as="li" key={it.id} gap={2} align="center">
            <CheckboxInput
              label={it.name}
              isLabelHidden
              value={it.checked}
              onChange={() => toggle(it.id)}
            />
            <Text
              maxLines={1}
              hasStrikethrough={it.checked}
              color={it.checked ? "disabled" : "primary"}
            >
              {it.name}
            </Text>
          </HStack>
        ))}
      </VStack>
      {items.length === 0 && (
        <EmptyState isCompact title="List is empty" description="Add the first item above." />
      )}
    </VStack>
  );
}
