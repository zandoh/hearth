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
import { useConfirm } from "../confirm";
import { usePointerDrag } from "../usePointerDrag";
import { useMutate } from "../useMutate";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import { MAX_NOTE_LENGTH, type Note, addNote, deleteNote, moveNote } from "./guestbookApi";

const COLORS = ["yellow", "pink", "blue", "green"] as const;

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
  const { confirm, confirmDialog } = useConfirm();
  const { mutate, error } = useMutate(reload);

  // Free-form corkboard drag: local overrides win over server positions
  // while a move is in flight, and are dropped once fresh data arrives.
  const wallRef = useRef<HTMLDivElement>(null);
  const [moved, setMoved] = useState<Record<number, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const activeIdRef = useRef<number | null>(null);

  // Domain half of the corkboard drag: clamp the note inside the wall in
  // fractional coordinates. Transport (window listeners, ref-carried
  // gesture payload) is usePointerDrag's.
  const drag = usePointerDrag<{ id: number; dx: number; dy: number; w: number; h: number }>({
    onMove: (e, g) => {
      const wall = wallRef.current;
      if (!wall) return;
      const wallRect = wall.getBoundingClientRect();
      const maxX = Math.max(wallRect.width - g.w, 1);
      const maxY = Math.max(wallRect.height - g.h, 1);
      const x = Math.min(Math.max(e.clientX - g.dx - wallRect.left, 0), maxX) / wallRect.width;
      const y = Math.min(Math.max(e.clientY - g.dy - wallRect.top, 0), maxY) / wallRect.height;
      lastPos.current = { x, y };
      setMoved((m) => ({ ...m, [g.id]: { x, y } }));
    },
    onEnd: (g) => {
      activeIdRef.current = null;
      setDraggingId(null);
      const pos = lastPos.current;
      lastPos.current = null;
      if (!pos) return;
      // The optimistic local position stays put; a successful reload
      // confirms it and a failure snaps the note back to server truth.
      mutate(() => moveNote(g.id, pos));
    },
  });

  useEffect(() => {
    setMoved((m) => {
      const active = activeIdRef.current;
      if (active !== null && m[active]) return { [active]: m[active] };
      return {};
    });
  }, [data]);

  const posOf = (n: Note) => moved[n.id] ?? (n.x < 0 ? scatter(n.id) : { x: n.x, y: n.y });

  const startDrag = (n: Note, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    activeIdRef.current = n.id;
    setDraggingId(n.id);
    drag.start(
      {
        id: n.id,
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top,
        w: rect.width,
        h: rect.height,
      },
      e,
    );
  };

  const add = () =>
    mutate(
      () => addNote(author.trim(), message.trim(), color),
      () => {
        setAuthor("");
        setMessage("");
        setAdding(false);
      },
    );

  const remove = (note: Note) =>
    confirm(
      {
        title: "Remove this note?",
        description: `"${note.message.slice(0, 60)}" will be taken off the board.`,
        actionLabel: "Remove",
      },
      () => mutate(() => deleteNote(note.id)),
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
        </VStack>
      )}

      {error && <Text className="form-error">{error}</Text>}

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
