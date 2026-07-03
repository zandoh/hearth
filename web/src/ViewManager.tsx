import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TimeInput, type ISOTimeString } from "@astryxdesign/core/TimeInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect } from "react";
import { createView, deleteView, setDefaultView, updateView } from "./api";
import { useConfirm } from "./confirm";
import { type GuestConfig, getGuestConfig, setGuestPin, setGuestView } from "./guestMode";
import { type NightConfig, getNightConfig, setNightConfig } from "./night";
import type { View } from "./types";

const SHADE_OPTIONS = [
  { value: "0.45", label: "Soft" },
  { value: "0.6", label: "Medium" },
  { value: "0.75", label: "Deep" },
];

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
  const [guest, setGuest] = useState<GuestConfig | null>(null);
  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [night, setNight] = useState<NightConfig | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(() => {
    getGuestConfig().then(setGuest).catch(console.error);
    getNightConfig().then(setNight).catch(console.error);
  }, []);

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

        <VStack as="ul" gap={3} className="plain-list">
          {views.map((v) => (
            <VStack as="li" key={v.id} gap={1} className="view-row">
              <HStack gap={2} align="center">
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
              <HStack gap={2} align="center" wrap="wrap">
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
                {guest?.guestViewId === v.id ? (
                  <Badge variant="teal" label="Guest" />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Set guest"
                    onClick={() =>
                      act(async () => {
                        await setGuestView(v.id);
                        setGuest(await getGuestConfig());
                      })
                    }
                  />
                )}
              </HStack>
            </VStack>
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

        <Heading level={3}>Guest mode</Heading>
        <Text type="supporting">
          Guests see only the guest view (or the screensaver if none is set). Leaving guest mode
          asks for this PIN.
        </Text>
        <HStack gap={2} align="end" wrap="wrap">
          {guest?.pinSet && (
            <TextInput
              label="Current PIN"
              type="password"
              value={currentPin}
              onChange={setCurrentPin}
              className="w-32"
            />
          )}
          <TextInput
            label={guest?.pinSet ? "New PIN" : "Guest PIN"}
            type="password"
            value={pin}
            onChange={setPin}
            className="w-32"
          />
          <Button
            size="sm"
            variant="secondary"
            label={guest?.pinSet ? "Change PIN" : "Set PIN"}
            onClick={() =>
              act(async () => {
                await setGuestPin(pin, currentPin);
                setPin("");
                setCurrentPin("");
                setGuest(await getGuestConfig());
              })
            }
          />
          {guest?.guestViewId ? (
            <Button
              size="sm"
              variant="ghost"
              label="Clear guest view"
              onClick={() =>
                act(async () => {
                  await setGuestView(0);
                  setGuest(await getGuestConfig());
                })
              }
            />
          ) : null}
        </HStack>
        {guest?.pinSet && (
          <Text type="supporting" size="xsm">
            Forgot the PIN? On the server, run{" "}
            <code className="brand-data">hearth -reset-guest-pin</code> — the next unlock attempt
            then succeeds with any PIN.
          </Text>
        )}

        <Heading level={3}>Night dimming</Heading>
        <Text type="supporting">
          Every screen dims during quiet hours. A tap wakes it for a couple of minutes.
        </Text>
        {night && (
          <NightControls
            night={night}
            save={(next) =>
              act(async () => {
                setNight(await setNightConfig(next));
              })
            }
          />
        )}

        {error && <Text className="form-error">{error}</Text>}
        <HStack justify="end">
          <Button variant="ghost" label="Close" onClick={onClose} />
        </HStack>
        {confirmDialog}
      </VStack>
    </Dialog>
  );
}

// Night dimming controls; every change saves immediately.
function NightControls({ night, save }: { night: NightConfig; save: (next: NightConfig) => void }) {
  const shadeValue = SHADE_OPTIONS.find((o) => Number(o.value) === night.level)?.value ?? "0.6";
  return (
    <HStack gap={2} align="end" wrap="wrap">
      <Switch
        label="Dim at night"
        value={night.enabled}
        onChange={(enabled) => save({ ...night, enabled })}
      />
      <TimeInput
        label="From"
        value={night.start as ISOTimeString}
        onChange={(start) => start && save({ ...night, start })}
        className="w-32"
      />
      <TimeInput
        label="Until"
        value={night.end as ISOTimeString}
        onChange={(end) => end && save({ ...night, end })}
        className="w-32"
      />
      <Selector
        label="Shade"
        size="sm"
        value={shadeValue}
        options={SHADE_OPTIONS}
        onChange={(v) => save({ ...night, level: Number(v) })}
      />
    </HStack>
  );
}
