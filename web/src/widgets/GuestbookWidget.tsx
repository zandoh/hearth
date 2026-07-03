import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useConfirm } from "../confirm";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";

interface Note {
  id: number;
  author: string;
  message: string;
  color: string;
  createdAt: string;
}

const api = "/api/widgets/guestbook";
const COLORS = ["yellow", "pink", "blue", "green"] as const;

// Deterministic little tilt per note so the wall looks hand-placed.
const tilt = (id: number) => ((id * 137) % 7) - 3;

export function GuestbookWidget(_props: WidgetProps) {
  const { data } = useWidgetData<Note[]>("guestbook");
  const notes = data ?? [];
  const [adding, setAdding] = useState(false);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [color, setColor] = useState<(typeof COLORS)[number]>("yellow");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const add = async () => {
    setError("");
    try {
      await apiFetch(api, {
        method: "POST",
        body: JSON.stringify({ author: author.trim(), message: message.trim(), color }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not add the note");
      return;
    }
    setAuthor("");
    setMessage("");
    setAdding(false);
  };

  const remove = (note: Note) =>
    confirm(
      {
        title: "Remove this note?",
        description: `"${note.message.slice(0, 60)}" will be taken off the board.`,
        actionLabel: "Remove",
      },
      () => apiFetch(`${api}/${note.id}`, { method: "DELETE" }).catch(console.error),
    );

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="end">
        <Button
          size="sm"
          variant="ghost"
          label={adding ? "×" : "+ Leave a note"}
          onClick={() => setAdding(!adding)}
        />
      </HStack>

      {adding && (
        <VStack gap={2}>
          <TextArea label="Your note" value={message} onChange={(v) => setMessage(v)} />
          <TextInput label="From" isOptional value={author} onChange={(v) => setAuthor(v)} />
          <HStack gap={1.5} align="center">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`note-swatch note-${c} no-drag${color === c ? " picked" : ""}`}
                aria-label={`${c} note`}
                onClick={() => setColor(c)}
              />
            ))}
            <span className="flex-1" />
            <Button size="sm" variant="primary" label="Stick it" onClick={add} />
          </HStack>
          {error && <Text className="form-error">{error}</Text>}
        </VStack>
      )}

      <div className="note-wall">
        {notes.map((n) => (
          <div
            key={n.id}
            className={`sticky-note note-${n.color}`}
            style={{ transform: `rotate(${tilt(n.id)}deg)` }}
          >
            <IconButton
              size="sm"
              variant="ghost"
              label="Remove note"
              icon={<Icon icon="close" size="sm" />}
              onClick={() => remove(n)}
            />
            <p className="sticky-message">{n.message}</p>
            {n.author && <p className="sticky-author">— {n.author}</p>}
          </div>
        ))}
      </div>
      {notes.length === 0 && !adding && (
        <EmptyState
          isCompact
          title="No notes yet"
          description="Guests can leave a note for the household here."
        />
      )}
      {confirmDialog}
    </VStack>
  );
}
