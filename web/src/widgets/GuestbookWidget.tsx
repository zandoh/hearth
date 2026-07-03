import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
  x: number;
  y: number;
  createdAt: string;
}

const api = "/api/widgets/guestbook";
const COLORS = ["yellow", "pink", "blue", "green"] as const;
// Mirrors the server's limit (280 runes, checked in guestbook.handleAdd).
const MAX_NOTE_LENGTH = 280;

// Deterministic little tilt per note so the wall looks hand-placed.
const tilt = (id: number) => ((id * 137) % 7) - 3;

// Notes that were never dragged (x/y = -1 from the server) get a
// deterministic scatter so every device shows them in the same spot.
const scatter = (id: number) => ({
  x: (((id * 89) % 60) + 3) / 100,
  y: (((id * 53) % 55) + 3) / 100,
});

export function GuestbookWidget(_props: WidgetProps) {
  const { data, reload } = useWidgetData<Note[]>("guestbook");
  const notes = data ?? [];
  const [adding, setAdding] = useState(false);
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [color, setColor] = useState<(typeof COLORS)[number]>("yellow");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  // Free-form corkboard drag: local overrides win over server positions
  // while a move is in flight, and are dropped once fresh data arrives.
  const wallRef = useRef<HTMLDivElement>(null);
  const [moved, setMoved] = useState<Record<number, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const grip = useRef<{ id: number; dx: number; dy: number } | null>(null);
  useEffect(() => {
    setMoved((m) => {
      const active = grip.current?.id;
      if (active !== undefined && m[active]) return { [active]: m[active] };
      return {};
    });
  }, [data]);

  const posOf = (n: Note) => moved[n.id] ?? (n.x < 0 ? scatter(n.id) : { x: n.x, y: n.y });

  const startDrag = (n: Note, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    grip.current = { id: n.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(n.id);
  };

  const moveDrag = (n: Note, e: React.PointerEvent<HTMLDivElement>) => {
    const g = grip.current;
    const wall = wallRef.current;
    if (!g || g.id !== n.id || !wall) return;
    const wallRect = wall.getBoundingClientRect();
    const noteRect = e.currentTarget.getBoundingClientRect();
    const maxX = Math.max(wallRect.width - noteRect.width, 1);
    const maxY = Math.max(wallRect.height - noteRect.height, 1);
    const x = Math.min(Math.max(e.clientX - g.dx - wallRect.left, 0), maxX) / wallRect.width;
    const y = Math.min(Math.max(e.clientY - g.dy - wallRect.top, 0), maxY) / wallRect.height;
    setMoved((m) => ({ ...m, [n.id]: { x, y } }));
  };

  const endDrag = (n: Note) => {
    const g = grip.current;
    if (!g || g.id !== n.id) return;
    grip.current = null;
    setDraggingId(null);
    const pos = moved[n.id];
    if (!pos) return;
    apiFetch(`${api}/${n.id}/position`, {
      method: "PUT",
      body: JSON.stringify(pos),
    })
      .then(reload)
      .catch(console.error);
  };

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
    // SSE echoes this to other screens; our own screen must not depend on it.
    reload();
  };

  const remove = (note: Note) =>
    confirm(
      {
        title: "Remove this note?",
        description: `"${note.message.slice(0, 60)}" will be taken off the board.`,
        actionLabel: "Remove",
      },
      () => apiFetch(`${api}/${note.id}`, { method: "DELETE" }).then(reload).catch(console.error),
    );

  return (
    <VStack className="widget-body" gap={2}>
      <HStack justify="end">
        <IconButton
          size="sm"
          variant="ghost"
          label={adding ? "Cancel" : "Leave a note"}
          tooltip={adding ? "Cancel" : "Leave a note"}
          icon={<Icon icon={adding ? "close" : Plus} size="sm" />}
          onClick={() => setAdding(!adding)}
        />
      </HStack>

      {adding && (
        <VStack gap={2}>
          <TextArea
            label="Your note"
            value={message}
            onChange={(v) => setMessage(v)}
            maxLength={MAX_NOTE_LENGTH}
          />
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
            <Button
              size="sm"
              variant="primary"
              label="Stick it"
              isDisabled={!message.trim() || [...message].length > MAX_NOTE_LENGTH}
              onClick={add}
            />
          </HStack>
          {error && <Text className="form-error">{error}</Text>}
        </VStack>
      )}

      <div className="note-wall no-drag" ref={wallRef}>
        {notes.map((n) => {
          const pos = posOf(n);
          return (
            <div
              key={n.id}
              className={`sticky-note note-${n.color}${draggingId === n.id ? " lifted" : ""}`}
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                transform: `rotate(${draggingId === n.id ? 0 : tilt(n.id)}deg)`,
              }}
              onPointerDown={(e) => startDrag(n, e)}
              onPointerMove={(e) => moveDrag(n, e)}
              onPointerUp={() => endDrag(n)}
              onPointerCancel={() => endDrag(n)}
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
          );
        })}
        {notes.length === 0 && !adding && (
          <EmptyState
            isCompact
            title="No notes yet"
            description="Guests can leave a note for the household here."
          />
        )}
      </div>
      {confirmDialog}
    </VStack>
  );
}
