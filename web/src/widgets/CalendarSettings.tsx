import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useConfirm } from "../confirm";
import { useTopic } from "../useSSE";
import {
  type AvailableGoogleCalendar,
  type Calendar,
  type GoogleStatus,
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

// Household calendar management: local calendars, plus connecting a Google
// account and picking which of its calendars Hearth should show.
export function CalendarSettings({ onClose }: { onClose: () => void }) {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [available, setAvailable] = useState<AvailableGoogleCalendar[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4f6df5");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const reload = useCallback(() => {
    getCalendars().then(setCalendars).catch(console.error);
    getGoogleStatus()
      .then((status) => {
        setGoogle(status);
        if (status.connected) {
          getAvailableGoogleCalendars().then(setAvailable).catch(console.error);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(reload, [reload]);
  useTopic("calendar", reload);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setBusy("");
    }
  };

  const addLocal = () =>
    run("add-local", async () => {
      if (!newName.trim()) throw new Error("calendar name is required");
      await createLocalCalendar(newName.trim(), newColor);
      setNewName("");
    });

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
                onChange={(e) =>
                  updateCalendar({ ...c, color: e.target.value }).catch(console.error)
                }
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
                onChange={(checked) =>
                  updateCalendar({ ...c, enabled: checked }).catch(console.error)
                }
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
                    () => run(`del-${c.id}`, () => deleteCalendar(c.id)),
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
          <Button
            size="sm"
            variant="secondary"
            label="Add"
            isDisabled={busy !== ""}
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
                isDisabled={busy !== ""}
                onClick={() => run("sync", syncNow)}
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
                    () => run("disconnect", disconnectGoogle),
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
                      isDisabled={busy !== ""}
                      onClick={() =>
                        run(`add-${g.googleId}`, () =>
                          addGoogleCalendar(g.googleId, g.name, g.color),
                        )
                      }
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
