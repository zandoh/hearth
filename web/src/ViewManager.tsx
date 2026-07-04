import { useRef, useState } from "react";
import { usePointerDrag } from "./usePointerDrag";
import { GripVertical } from "lucide-react";
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
import {
  createView,
  deleteView,
  reorderViews,
  setDefaultView,
  setViewHidden,
  setViewSchedule,
  updateView,
} from "./api";
import { useConfirm } from "./confirm";
import { Avatar } from "./Avatar";
import { type GuestConfig, getGuestConfig, setGuestPin, setGuestView } from "./guestMode";
import { type NightConfig, getNightConfig, setNightConfig } from "./night";
import { type Profile, createProfile, deleteProfile, updateProfile, useProfiles } from "./profiles";
import { isDemo } from "./demo";
import type { View } from "./types";
import { useMutate } from "./useMutate";

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
  const [guest, setGuest] = useState<GuestConfig | null>(null);
  const [pin, setPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [night, setNight] = useState<NightConfig | null>(null);
  const [schedulingId, setSchedulingId] = useState<number | null>(null);
  const [schedStart, setSchedStart] = useState("07:00" as ISOTimeString);
  const [schedEnd, setSchedEnd] = useState("09:00" as ISOTimeString);
  const { confirm, confirmDialog } = useConfirm();
  // No reload here: the views list lives in App, which refreshes it over the
  // "views" SSE topic (see the component comment above). Sections that own
  // their data (profiles, guest, night) refresh inside their own actions.
  const { mutate: act, error } = useMutate();

  useEffect(() => {
    getGuestConfig().then(setGuest).catch(console.error);
    getNightConfig().then(setNight).catch(console.error);
  }, []);

  // Fresh views (post-reorder SSE) supersede the drag overlay.
  useEffect(() => {
    if (draggingId === null) setDragOrder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views]);

  // Drag-to-reorder: the grip captures the pointer, rows re-slot live in a
  // local order overlay, and release persists the whole order. The overlay
  // stays up until the refreshed views arrive so the list never snaps back.
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Pointer handlers can fire before React re-renders them (touch bursts);
  // the ref always carries the live order for the release handler.
  const dragOrderRef = useRef<number[] | null>(null);

  const orderedViews = dragOrder
    ? dragOrder.map((id) => views.find((v) => v.id === id)).filter((v): v is View => !!v)
    : views;

  // Domain half of the reorder drag: midpoint re-slotting over the live
  // order; transport (window listeners, ref-carried gesture) is
  // usePointerDrag's.
  const drag = usePointerDrag<number>({
    onMove: (e, id) => {
      const list = listRef.current;
      const prev = dragOrderRef.current;
      if (!list || !prev) return;
      const rows = [...list.querySelectorAll("li")];
      let target = rows.length - 1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          target = i;
          break;
        }
      }
      const from = prev.indexOf(id);
      if (from === target) return;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(target, 0, id);
      dragOrderRef.current = next;
      setDragOrder(next);
    },
    onEnd: () => {
      setDraggingId(null);
      const order = dragOrderRef.current;
      dragOrderRef.current = null;
      if (order) act(() => reorderViews(order));
    },
  });

  const gripDown = (v: View, e: React.PointerEvent<HTMLElement>) => {
    setDraggingId(v.id);
    dragOrderRef.current = views.map((x) => x.id);
    setDragOrder(dragOrderRef.current);
    drag.start(v.id, e);
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
          The default view is what the kiosk shows at rest. A scheduled view takes over during its
          daily window (guests always stay on the guest view). Each view keeps its own widget
          layout.
        </Text>

        <div ref={listRef}>
          <VStack as="ul" gap={3} className="plain-list">
            {orderedViews.map((v) => (
              <VStack
                as="li"
                key={v.id}
                gap={1}
                className={`view-row${draggingId === v.id ? " view-row-dragging" : ""}`}
              >
                <HStack gap={2} align="center">
                  <span
                    className="view-drag-handle no-drag"
                    aria-label={`Reorder ${v.name}`}
                    onPointerDown={(e) => gripDown(v, e)}
                  >
                    <Icon icon={GripVertical} size="sm" />
                  </span>
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
                  {v.hidden ? (
                    <>
                      <Badge variant="neutral" label="Hidden" />
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Show"
                        onClick={() => act(() => setViewHidden(v.id, false))}
                      />
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Hide"
                      onClick={() => act(() => setViewHidden(v.id, true))}
                    />
                  )}
                  {v.scheduleStart && v.scheduleEnd ? (
                    <>
                      <Badge variant="info" label={`${v.scheduleStart}–${v.scheduleEnd}`} />
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Clear schedule"
                        onClick={() => act(() => setViewSchedule(v.id, "", ""))}
                      />
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      label="Schedule"
                      onClick={() => setSchedulingId(schedulingId === v.id ? null : v.id)}
                    />
                  )}
                </HStack>
                {schedulingId === v.id && (
                  <HStack gap={2} align="end" wrap="wrap">
                    <TimeInput
                      label="From"
                      value={schedStart}
                      onChange={(t) => t && setSchedStart(t)}
                      className="w-32"
                    />
                    <TimeInput
                      label="Until"
                      value={schedEnd}
                      onChange={(t) => t && setSchedEnd(t)}
                      className="w-32"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      label="Save schedule"
                      onClick={() =>
                        act(async () => {
                          await setViewSchedule(v.id, schedStart, schedEnd);
                          setSchedulingId(null);
                        })
                      }
                    />
                  </HStack>
                )}
              </VStack>
            ))}
          </VStack>
        </div>

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

        <Heading level={3}>Household</Heading>
        <Text type="supporting">
          The people behind chores and medications. Deleting someone keeps their chores and meds,
          just unassigned.
        </Text>
        <HouseholdSection act={act} confirm={confirm} />

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

        {!isDemo && (
          <>
            <Heading level={3}>Backups</Heading>
            <Text type="supporting">
              A snapshot is written to backups/ next to the database every night; the last 7 are
              kept. Download grabs a fresh copy right now.
            </Text>
            <HStack>
              <Button
                size="sm"
                variant="secondary"
                label="Download backup"
                onClick={() => {
                  window.location.href = "/api/backup";
                }}
              />
            </HStack>
          </>
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

// Household profiles: add, rename (Enter), recolor, delete.
function HouseholdSection({
  act,
  confirm,
}: {
  act: (fn: () => Promise<unknown>) => void;
  confirm: (
    opts: { title: string; description: string; actionLabel: string },
    onConfirm: () => void,
  ) => void;
}) {
  const { profiles, reload } = useProfiles();
  const [names, setNames] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#D97742");

  const rename = (p: Profile) => {
    const name = (names[p.id] ?? p.name).trim();
    if (!name || name === p.name) return;
    act(async () => {
      await updateProfile({ ...p, name });
      reload();
    });
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    act(async () => {
      await createProfile(name, newColor);
      setNewName("");
      reload();
    });
  };

  return (
    <VStack gap={2}>
      <VStack as="ul" gap={2} className="plain-list">
        {profiles.map((p) => (
          <HStack as="li" key={p.id} gap={2} align="center">
            <Avatar profile={p} />
            <TextInput
              label={`Rename ${p.name}`}
              isLabelHidden
              value={names[p.id] ?? p.name}
              onChange={(value) => setNames((n) => ({ ...n, [p.id]: value }))}
              onEnter={() => rename(p)}
              className="min-w-0 flex-1"
            />
            <input
              type="color"
              value={p.color}
              onChange={(e) =>
                act(async () => {
                  await updateProfile({ ...p, color: e.target.value });
                  reload();
                })
              }
              title={`${p.name}'s color`}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`Delete ${p.name}`}
              icon={<Icon icon="close" size="sm" />}
              onClick={() =>
                confirm(
                  {
                    title: `Remove ${p.name}?`,
                    description: "Their chores and medications stay, just unassigned.",
                    actionLabel: "Remove",
                  },
                  () =>
                    act(async () => {
                      await deleteProfile(p.id);
                      reload();
                    }),
                )
              }
            />
          </HStack>
        ))}
      </VStack>
      <HStack gap={2} align="end">
        <TextInput
          label="New person"
          placeholder="e.g. Riley"
          value={newName}
          onChange={setNewName}
          onEnter={add}
          className="min-w-0 flex-1"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          title="Color"
        />
        <Button size="sm" variant="secondary" label="Add person" onClick={add} />
      </HStack>
    </VStack>
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
