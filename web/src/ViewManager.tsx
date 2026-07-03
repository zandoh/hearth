import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { createView, deleteView, setDefaultView, updateView } from "./api";
import { useConfirm } from "./confirm";
import type { View } from "./types";

// Manage saved views: rename, set the kiosk's default, delete, create.
// Mutations publish on the "views" SSE topic, so the list refreshes through
// the app's normal reload path.
export function ViewManager({
  views,
  onSwitch,
  onClose,
}: {
  views: View[];
  onSwitch: (id: number) => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const act = (fn: () => Promise<unknown>) => {
    setError("");
    fn().catch((err: unknown) => setError(err instanceof Error ? err.message : "request failed"));
  };

  const rename = (view: View) => {
    const name = (names[view.id] ?? view.name).trim();
    if (!name || name === view.name) return;
    act(() => updateView(view.id, name, view.layout));
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    act(async () => {
      const created = await createView(name, []);
      setNewName("");
      onSwitch(created.id);
    });
  };

  return (
    <Dialog isOpen width={480} onOpenChange={(open) => !open && onClose()}>
      <VStack gap={3} className="cal-dialog-body">
        <Heading level={2}>Views</Heading>
        <Text type="supporting">
          The default view is what the kiosk shows on load. Each view keeps its own widget layout.
        </Text>

        <VStack as="ul" gap={2} className="plain-list">
          {views.map((v) => (
            <HStack as="li" key={v.id} gap={2} align="center">
              <TextInput
                label={`Rename ${v.name}`}
                isLabelHidden
                value={names[v.id] ?? v.name}
                onChange={(value) => setNames((n) => ({ ...n, [v.id]: value }))}
                onEnter={() => rename(v)}
                className="min-w-0 flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                label="Rename"
                isDisabled={(names[v.id] ?? v.name).trim() === v.name}
                onClick={() => rename(v)}
              />
              {v.isDefault ? (
                <Badge variant="info" label="Default" />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  label="Make default"
                  onClick={() => act(() => setDefaultView(v.id))}
                />
              )}
              <IconButton
                size="sm"
                variant="ghost"
                label={`Delete ${v.name}`}
                icon={<Icon icon="close" size="sm" />}
                isDisabled={views.length <= 1}
                onClick={() =>
                  confirm(
                    {
                      title: `Delete "${v.name}"?`,
                      description:
                        "The view's layout is deleted. Widget data (events, lists, chores) is not affected.",
                      actionLabel: "Delete",
                    },
                    () => act(() => deleteView(v.id)),
                  )
                }
              />
            </HStack>
          ))}
        </VStack>

        <HStack gap={2} align="end">
          <TextInput
            label="New view"
            placeholder="e.g. Kitchen, Morning"
            value={newName}
            onChange={setNewName}
            onEnter={add}
            className="min-w-0 flex-1"
          />
          <Button size="sm" variant="secondary" label="Add view" onClick={add} />
        </HStack>

        {error && <Text className="form-error">{error}</Text>}
        <HStack justify="end">
          <Button variant="ghost" label="Close" onClick={onClose} />
        </HStack>
        {confirmDialog}
      </VStack>
    </Dialog>
  );
}
