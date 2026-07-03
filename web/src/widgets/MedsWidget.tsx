import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useConfirm } from "../confirm";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";

interface Dose {
  slot: string;
  taken: boolean;
}

interface Med {
  id: number;
  name: string;
  person: string;
  times: string[];
  doses: Dose[];
}

const api = "/api/widgets/meds";

export function MedsWidget(_props: WidgetProps) {
  const { data } = useWidgetData<{ medications: Med[] }>("meds", "/today");
  const meds = data?.medications ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [times, setTimes] = useState("08:00");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const toggle = (medId: number, slot: string) =>
    apiFetch(`${api}/${medId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ slot }),
    }).catch(console.error);

  const remove = (id: number, medName: string) =>
    confirm(
      {
        title: `Remove ${medName}?`,
        description: "The medication and its dose history will be deleted.",
        actionLabel: "Remove",
      },
      () => apiFetch(`${api}/${id}`, { method: "DELETE" }).catch(console.error),
    );

  const add = async () => {
    setError("");
    const slots = times
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await apiFetch(api, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), person: person.trim(), times: slots }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add");
      return;
    }
    setName("");
    setPerson("");
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
          <TextInput label="Medication" value={name} onChange={(v) => setName(v)} />
          <TextInput label="Person" isOptional value={person} onChange={(v) => setPerson(v)} />
          <TextInput
            label="Dose times"
            placeholder="08:00, 20:00"
            value={times}
            onChange={(v) => setTimes(v)}
            onEnter={add}
          />
          {error && <Text className="form-error">{error}</Text>}
          <HStack justify="end">
            <Button size="sm" variant="primary" label="Add" onClick={add} />
          </HStack>
        </VStack>
      )}

      <VStack as="ul" gap={2} className="plain-list">
        {meds.map((m) => (
          <HStack as="li" key={m.id} gap={2} align="center">
            <VStack gap={0} className="min-w-0 flex-1">
              <Text maxLines={1}>{m.name}</Text>
              {m.person && (
                <Text type="supporting" size="xsm">
                  {m.person}
                </Text>
              )}
            </VStack>
            <HStack gap={1.5} wrap="wrap">
              {m.doses.map((d) => (
                <ToggleButton
                  key={d.slot}
                  size="sm"
                  label={`${m.name} ${d.slot} dose`}
                  isPressed={d.taken}
                  icon={d.taken ? <Icon icon="check" size="sm" /> : undefined}
                  onPressedChange={() => toggle(m.id, d.slot)}
                >
                  {d.slot}
                </ToggleButton>
              ))}
            </HStack>
            <IconButton
              size="sm"
              variant="ghost"
              label={`Remove ${m.name}`}
              icon={<Icon icon="close" size="sm" />}
              onClick={() => remove(m.id, m.name)}
            />
          </HStack>
        ))}
      </VStack>
      {meds.length === 0 && !adding && (
        <EmptyState isCompact title="No medications" description="Add one with the + button." />
      )}
      {confirmDialog}
    </VStack>
  );
}
