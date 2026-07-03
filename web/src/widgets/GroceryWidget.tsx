import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutate } from "../useMutate";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import { type GroceryItem, addItem, clearChecked, toggleItem } from "./groceryApi";

export function GroceryWidget(_props: WidgetProps) {
  const { data, reload } = useWidgetData<GroceryItem[]>("grocery");
  const items = data ?? [];
  const [name, setName] = useState("");
  const { mutate, error } = useMutate(reload);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutate(
      () => addItem(trimmed),
      () => setName(""),
    );
  };

  const toggle = (id: number) => mutate(() => toggleItem(id));

  const clearDone = () => mutate(() => clearChecked());

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
        <IconButton
          size="sm"
          variant="secondary"
          label="Add item"
          tooltip="Add item"
          icon={<Icon icon={Plus} size="sm" />}
          onClick={add}
        />
      </HStack>

      {error && <Text className="form-error">{error}</Text>}

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
