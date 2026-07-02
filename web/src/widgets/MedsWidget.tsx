import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useTopic } from "../useSSE";
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
  const [meds, setMeds] = useState<Med[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [person, setPerson] = useState("");
  const [times, setTimes] = useState("08:00");
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    fetch(`${api}/today`)
      .then((r) => r.json())
      .then((data: { medications: Med[] }) => setMeds(data.medications))
      .catch(console.error);
  }, []);

  useEffect(reload, [reload]);
  useTopic("meds", reload);

  const toggle = (medId: number, slot: string) =>
    fetch(`${api}/${medId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    }).catch(console.error);

  const remove = (id: number, medName: string) => {
    if (confirm(`Remove medication "${medName}" and its history?`)) {
      fetch(`${api}/${id}`, { method: "DELETE" }).catch(console.error);
    }
  };

  const add = async () => {
    setError("");
    const slots = times
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), person: person.trim(), times: slots }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "failed to add");
      return;
    }
    setName("");
    setPerson("");
    setAdding(false);
  };

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="between" align="center">
        <Text type="label">Medications</Text>
        <Button
          size="sm"
          variant="ghost"
          label={adding ? "×" : "+"}
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
                <button
                  key={d.slot}
                  className={`dose-pill no-drag${d.taken ? " taken" : ""}`}
                  onClick={() => toggle(m.id, d.slot)}
                >
                  {d.taken ? "✓ " : ""}
                  {d.slot}
                </button>
              ))}
            </HStack>
            <Button size="sm" variant="ghost" label="✕" onClick={() => remove(m.id, m.name)} />
          </HStack>
        ))}
      </VStack>
      {meds.length === 0 && !adding && (
        <EmptyState isCompact title="No medications" description="Add one with the + button." />
      )}
    </VStack>
  );
}
