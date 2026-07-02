import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, {
  noCompactor,
  useContainerWidth,
  type Layout,
  type LayoutItem as GridPos,
} from "react-grid-layout";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { getViews, updateView } from "./api";
import { GRID_COLS, firstFit, mergePositions } from "./layout";
import { useTopic } from "./useSSE";
import { widgetRegistry } from "./widgets/registry";
import type { LayoutItem, View } from "./types";

const ROW_HEIGHT = 72;

// Guide geometry mirrors RGL defaults: 10px margins/padding, 72px rows.
/** Datadog-style grid guides shown while editing, aligned to RGL geometry. */
function GridGuides({ rows }: { rows: number }) {
  return (
    <div className="grid-guides" aria-hidden>
      {Array.from({ length: rows * GRID_COLS }, (_, i) => (
        <div key={i} className="grid-guide-cell" />
      ))}
    </div>
  );
}

export default function App() {
  const [views, setViews] = useState<View[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  // During an edit session, draftItems is the source of truth for WHICH
  // widgets exist; their live x/y/w/h accumulate in liveLayoutRef so drag
  // ticks don't re-render the grid (re-rendering mid-drag cancels the drag).
  const [draftItems, setDraftItems] = useState<LayoutItem[] | null>(null);
  const liveLayoutRef = useRef<Layout | null>(null);
  // Widget slug being dragged from the palette (Datadog-style tray drag).
  const dragSlugRef = useRef<string | null>(null);
  const { width, containerRef, mounted } = useContainerWidth();

  const loadViews = useCallback(() => {
    getViews().then(setViews).catch(console.error);
  }, []);

  useEffect(loadViews, [loadViews]);
  useTopic("views", loadViews);

  const active: View | undefined = useMemo(
    () => views.find((v) => v.id === activeId) ?? views.find((v) => v.isDefault) ?? views[0],
    [views, activeId],
  );

  const items = editing ? (draftItems ?? []) : (active?.layout ?? []);
  const gridLayout: Layout = items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      if (!editing) return;
      liveLayoutRef.current = layout;
    },
    [editing],
  );

  const startEditing = () => {
    setDraftItems(active?.layout ?? []);
    liveLayoutRef.current = null;
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setDraftItems(null);
    liveLayoutRef.current = null;
  };

  const addWidget = (slug: string) => {
    const def = widgetRegistry[slug];
    if (!def) return;
    setDraftItems((current) => {
      const merged = mergePositions(current ?? [], liveLayoutRef.current);
      liveLayoutRef.current = null;
      const { w, h } = def.defaultSize;
      const spot = firstFit(merged, w, h);
      const n = merged.filter((item) => item.widget === slug).length + 1;
      return [
        ...merged,
        { i: `${slug}-${n}-${Date.now().toString(36)}`, widget: slug, ...spot, w, h, config: {} },
      ];
    });
  };

  const removeWidget = (instanceId: string) => {
    setDraftItems((current) => {
      const merged = mergePositions(current ?? [], liveLayoutRef.current);
      liveLayoutRef.current = null;
      return merged.filter((item) => item.i !== instanceId);
    });
  };

  // Drop from the palette: the grid tells us where the preview landed.
  const onDrop = (layout: Layout, item: GridPos | undefined) => {
    const slug = dragSlugRef.current;
    dragSlugRef.current = null;
    if (!slug || !item) return;
    const def = widgetRegistry[slug];
    if (!def) return;
    setDraftItems((current) => {
      const merged = mergePositions(current ?? [], layout);
      liveLayoutRef.current = null;
      const { w, h } = def.defaultSize;
      // Land on the drop cell if it's free; otherwise take the nearest fit
      // instead of overlapping whatever is already there.
      const occupied = merged.some(
        (it) =>
          item.x < it.x + it.w && it.x < item.x + w && item.y < it.y + it.h && it.y < item.y + h,
      );
      const spot = occupied ? firstFit(merged, w, h) : { x: item.x, y: item.y };
      const n = merged.filter((it) => it.widget === slug).length + 1;
      return [
        ...merged,
        { i: `${slug}-${n}-${Date.now().toString(36)}`, widget: slug, ...spot, w, h, config: {} },
      ];
    });
  };

  const saveLayout = async () => {
    if (!active || !draftItems) {
      stopEditing();
      return;
    }
    const merged = mergePositions(draftItems, liveLayoutRef.current);
    try {
      await updateView(active.id, active.name, merged);
      stopEditing();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app">
      <HStack as="header" className="app-header" gap={4} align="center">
        <Heading level={1} className="app-title">
          Hearth
        </Heading>
        <HStack as="nav" gap={1.5} className="flex-1">
          {views.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === active?.id ? "primary" : "ghost"}
              label={v.name}
              onClick={() => {
                setActiveId(v.id);
                stopEditing();
              }}
            />
          ))}
        </HStack>
        <HStack gap={2}>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" label="Cancel" onClick={stopEditing} />
              <Button size="sm" variant="primary" label="Save layout" onClick={saveLayout} />
            </>
          ) : (
            <Button size="sm" variant="secondary" label="Edit" onClick={startEditing} />
          )}
        </HStack>
      </HStack>

      {editing && (
        <HStack className="widget-palette" gap={1.5} align="center" wrap="wrap">
          <Text type="supporting">Drag onto the board (or click):</Text>
          {Object.entries(widgetRegistry).map(([slug, def]) => (
            <button
              key={slug}
              className="palette-chip"
              draggable
              onDragStart={(e) => {
                dragSlugRef.current = slug;
                e.dataTransfer.setData("text/plain", slug);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => addWidget(slug)}
            >
              + {def.title}
            </button>
          ))}
        </HStack>
      )}

      <main className={`grid-container${editing ? " editing" : ""}`} ref={containerRef}>
        {editing && (
          <GridGuides
            rows={Math.max(9, items.reduce((m, it) => Math.max(m, it.y + it.h), 0) + 4)}
          />
        )}
        {mounted && active && (
          <GridLayout
            width={width}
            layout={gridLayout}
            gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT }}
            // Datadog-style board: widgets stay exactly where you put them
            // (no auto-compacting into a list) and gaps are allowed.
            compactor={noCompactor}
            dragConfig={{ enabled: editing, cancel: ".no-drag" }}
            resizeConfig={{
              enabled: editing,
              handles: ["s", "w", "e", "n", "sw", "nw", "se", "ne"],
            }}
            dropConfig={{
              enabled: editing,
              defaultItem: { w: 3, h: 3 },
              onDragOver: () => {
                const def = dragSlugRef.current ? widgetRegistry[dragSlugRef.current] : null;
                return def ? { w: def.defaultSize.w, h: def.defaultSize.h } : undefined;
              },
            }}
            onDrop={onDrop}
            onLayoutChange={onLayoutChange}
          >
            {items.map((item) => {
              const def = widgetRegistry[item.widget];
              return (
                <div key={item.i} className={`widget-card${editing ? " editing" : ""}`}>
                  {editing && (
                    <button
                      className="widget-remove no-drag"
                      title="Remove widget"
                      onClick={() => removeWidget(item.i)}
                    >
                      ✕
                    </button>
                  )}
                  {def ? (
                    <def.component item={item} />
                  ) : (
                    <div className="widget-unknown">Unknown widget: {item.widget}</div>
                  )}
                </div>
              );
            })}
          </GridLayout>
        )}
      </main>
    </div>
  );
}
