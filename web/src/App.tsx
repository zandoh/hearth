import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { getViews, updateView } from "./api";
import { useTopic } from "./useSSE";
import { widgetRegistry } from "./widgets/registry";
import type { LayoutItem, View } from "./types";

const GRID_COLS = 12;
const ROW_HEIGHT = 72;

export default function App() {
  const [views, setViews] = useState<View[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutItem[] | null>(null);
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

  const items = draft ?? active?.layout ?? [];
  const gridLayout: Layout = items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));

  const onLayoutChange = useCallback(
    (layout: Layout) => {
      if (!editing) return;
      setDraft((current) => {
        const source = current ?? active?.layout ?? [];
        return source.map((item) => {
          const moved = layout.find((l) => l.i === item.i);
          return moved ? { ...item, x: moved.x, y: moved.y, w: moved.w, h: moved.h } : item;
        });
      });
    },
    [editing, active],
  );

  const saveLayout = async () => {
    if (!active || !draft) {
      setEditing(false);
      return;
    }
    try {
      await updateView(active.id, active.name, draft);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <Heading level={1} className="app-title">
          Hearth
        </Heading>
        <nav className="view-switcher">
          {views.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === active?.id ? "primary" : "ghost"}
              label={v.name}
              onClick={() => {
                setActiveId(v.id);
                setEditing(false);
                setDraft(null);
              }}
            />
          ))}
        </nav>
        <div className="header-actions">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                label="Cancel"
                onClick={() => {
                  setEditing(false);
                  setDraft(null);
                }}
              />
              <Button size="sm" variant="primary" label="Save layout" onClick={saveLayout} />
            </>
          ) : (
            <Button size="sm" variant="secondary" label="Edit" onClick={() => setEditing(true)} />
          )}
        </div>
      </header>

      <main className="grid-container" ref={containerRef}>
        {mounted && active && (
          <GridLayout
            width={width}
            layout={gridLayout}
            gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT }}
            dragConfig={{ enabled: editing }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={onLayoutChange}
          >
            {items.map((item) => {
              const def = widgetRegistry[item.widget];
              return (
                <div key={item.i} className={`widget-card${editing ? " editing" : ""}`}>
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
