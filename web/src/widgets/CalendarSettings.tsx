import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useConfirm } from "../confirm";
import { TOPICS } from "../topics";
import { useMutate } from "../useMutate";
import { useTopicData } from "../useWidgetData";
import {
  addGoogleCalendar,
  createLocalCalendar,
  deleteCalendar,
  disconnectGoogle,
  getAvailableGoogleCalendars,
  getCalendars,
  getGoogleStatus,
  googleConnectURL,
  syncNow,
  updateCalendar,
} from "./calendarApi";

// Google status plus the account's calendar list, fetched together because
// the list only makes sense once we know the account is connected.
const getGoogle = async () => {
  const status = await getGoogleStatus();
  const available = status.connected ? await getAvailableGoogleCalendars() : null;
  return { status, available };
};

// Household calendar management: local calendars, plus connecting a Google
// account and picking which of its calendars Hearth should show.
export function CalendarSettings({
  onChanged,
  onClose,
}: {
  onChanged: () => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4f6df5");
  const { confirm, confirmDialog } = useConfirm();

  const { data: calendarsData, reload: reloadCalendars } = useTopicData(
    TOPICS.calendar,
    getCalendars,
  );
  const { data: googleData, reload: reloadGoogle } = useTopicData(TOPICS.calendar, getGoogle);
  const calendars = calendarsData ?? [];
  const google = googleData?.status ?? null;
  const available = googleData?.available ?? null;

  // Refresh this dialog and the widget behind it directly — SSE only covers
  // other screens, not our own action.
  const refresh = useCallback(() => {
    reloadCalendars();
    reloadGoogle();
    onChanged();
  }, [reloadCalendars, reloadGoogle, onChanged]);
  const { mutate, error, busy } = useMutate(refresh);

  const addLocal = () =>
    mutate(
      async () => {
        if (!newName.trim()) throw new Error("calendar name is required");
        await createLocalCalendar(newName.trim(), newColor);
      },
      () => setNewName(""),
    );

  return (
    <Dialog isOpen width={480} onOpenChange={(open) => !open && onClose()}>
      <VStack gap={3} className="cal-dialog-body">
        <Heading level={2}>Calendars</Heading>

        <VStack as="ul" gap={2} className="plain-list">
          {calendars.map((c) => (
            <HStack as="li" key={c.id} gap={2} align="center">
              <input
                type="color"
                value={c.color}
                onChange={(e) => mutate(() => updateCalendar({ ...c, color: e.target.value }))}
                title="Calendar color"
              />
              <HStack gap={2} align="center" className="min-w-0 flex-1">
                <Text maxLines={1}>{c.name}</Text>
                {c.kind === "google" && <Badge variant="blue" label="Google" />}
              </HStack>
              <Switch
                label="Shown"
                isLabelHidden
                value={c.enabled}
                onChange={(checked) => mutate(() => updateCalendar({ ...c, enabled: checked }))}
              />
              <Button
                size="sm"
                variant="ghost"
                label="Remove"
                onClick={() =>
                  confirm(
                    {
                      title: `Remove "${c.name}"?`,
                      description:
                        c.kind === "google"
                          ? "It disappears from Hearth along with its events here. The calendar itself is untouched on Google."
                          : "The calendar and all of its events will be deleted.",
                      actionLabel: "Remove",
                    },
                    () => mutate(() => deleteCalendar(c.id)),
                  )
                }
              />
            </HStack>
          ))}
        </VStack>

        <HStack gap={2} align="end">
          <TextInput
            label="New local calendar"
            placeholder="e.g. Meals, School"
            value={newName}
            onChange={(v) => setNewName(v)}
            onEnter={addLocal}
            className="min-w-0 flex-1"
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            title="Color"
          />
          <IconButton
            size="sm"
            variant="secondary"
            label="Add calendar"
            tooltip="Add calendar"
            icon={<Icon icon={Plus} size="sm" />}
            isDisabled={busy}
            onClick={addLocal}
          />
        </HStack>

        <Heading level={3}>Google Calendar</Heading>
        {!google && <Text type="supporting">Checking…</Text>}
        {google && !google.configured && (
          <Text type="supporting">
            Not configured. Set HEARTH_GOOGLE_CLIENT_ID and HEARTH_GOOGLE_CLIENT_SECRET on the
            server — see the README for the one-time Google Cloud setup.
          </Text>
        )}
        {google?.configured && !google.connected && (
          <HStack>
            <Button
              variant="primary"
              label="Connect Google account"
              onClick={() => {
                window.location.href = googleConnectURL;
              }}
            />
          </HStack>
        )}
        {google?.connected && (
          <>
            <HStack gap={2} align="center" wrap="wrap">
              <Text type="supporting">
                Connected as <Text weight="semibold">{google.email || "Google account"}</Text>
              </Text>
              <Button
                size="sm"
                variant="ghost"
                label="Sync now"
                isDisabled={busy}
                onClick={() => mutate(syncNow)}
              />
              <Button
                size="sm"
                variant="ghost"
                label="Disconnect"
                onClick={() =>
                  confirm(
                    {
                      title: "Disconnect Google?",
                      description:
                        "Synced calendars stop updating until you connect again. Nothing is deleted.",
                      actionLabel: "Disconnect",
                    },
                    () => mutate(disconnectGoogle),
                  )
                }
              />
            </HStack>
            <VStack as="ul" gap={2} className="plain-list">
              {(available ?? []).map((g) => (
                <HStack as="li" key={g.googleId} gap={2} align="center">
                  <span className="cal-dot" style={{ background: g.color }} />
                  <HStack gap={2} align="center" className="min-w-0 flex-1">
                    <Text maxLines={1}>{g.name}</Text>
                    {g.primary && <Badge variant="neutral" label="primary" />}
                  </HStack>
                  {g.added ? (
                    <Text type="supporting">added</Text>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      label="Add to Hearth"
                      isDisabled={busy}
                      onClick={() => mutate(() => addGoogleCalendar(g.googleId, g.name, g.color))}
                    />
                  )}
                </HStack>
              ))}
            </VStack>
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
