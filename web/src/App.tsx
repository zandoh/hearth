import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, {
  useContainerWidth,
  type Compactor,
  type Layout,
  type LayoutItem as GridPos,
} from "react-grid-layout";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getViews, updateView } from "./api";
import { useConfirm } from "./confirm";
import { ViewManager } from "./ViewManager";
import { GRID_COLS, MIN_WIDGET_H, MIN_WIDGET_W, firstFit, mergePositions } from "./layout";
import { idleReturnMs, msUntilNightlyReload } from "./kiosk";
import { useConnectionState, useTopic } from "./useSSE";
import { widgetRegistry } from "./widgets/registry";
import type { View } from "./types";

const ROW_HEIGHT = 72;

// Free placement: gaps stay where you put them (no gravity), but collisions
// PUSH — Datadog-style. The key to "shift just enough": pushes are computed
// against a SNAPSHOT of the layout taken when the gesture started, not
// against wherever the last drag-tick shoved things. Every displaced widget
// keeps trying to return to its home spot and only sits as far down as the
// intruder actually forces it, so displacement never accumulates along the
// drag path and widgets spring back when the intruder moves away.
const gestureHomes = new Map<string, { x: number; y: number }>();
let gestureItemId: string | null = null;
// Hysteresis: widgets pushed on the previous tick stay pushed until the
// intruder clears them by a full cell. Without this, cursor jitter at a
// cell boundary makes neighbours oscillate home/pushed — the "jiggle".
const pushedLastTick = new Set<string>();

const collide = (a: GridPos, b: GridPos) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const nearby = (a: GridPos, b: GridPos) =>
  collide({ ...a, x: a.x - 1, y: a.y - 1, w: a.w + 2, h: a.h + 2 }, b);

const freePlacement: Compactor = {
  type: null,
  allowOverlap: false,
  compact: (layout) => {
    const placed: GridPos[] = [];
    const isIntruder = (it: GridPos) =>
      it.i === gestureItemId || (gestureHomes.size > 0 && !gestureHomes.has(it.i));
    // The item being dragged/resized/dropped is authoritative: place it
    // first at its current position.
    const intruders: GridPos[] = [];
    for (const item of layout) {
      if (isIntruder(item)) {
        const it = { ...item };
        intruders.push(it);
        placed.push(it);
      }
    }
    // Everyone else starts from their gesture-start home (falling back to
    // their current spot) and slides down only as far as needed.
    const rest = layout
      .filter((it) => !isIntruder(it))
      .map((it) => {
        const home = gestureHomes.get(it.i);
        return { ...it, x: home?.x ?? it.x, y: home?.y ?? it.y };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const nowPushed = new Set<string>();
    for (const it of rest) {
      const mustPush =
        placed.some((p) => collide(p, it)) ||
        // sticky: was pushed and the intruder is still within one cell
        (pushedLastTick.has(it.i) && intruders.some((p) => nearby(p, it)));
      if (mustPush) {
        while (placed.some((p) => collide(p, it))) it.y += 1;
        // re-settle upward toward home so a sticky push sits snug, not deep
        while (it.y > (gestureHomes.get(it.i)?.y ?? it.y)) {
          const up = { ...it, y: it.y - 1 };
          if (placed.some((p) => collide(p, up))) break;
          it.y = up.y;
        }
        if (it.y !== (gestureHomes.get(it.i)?.y ?? it.y)) nowPushed.add(it.i);
      }
      placed.push(it);
    }
    if (gestureHomes.size > 0) {
      pushedLastTick.clear();
      for (const id of nowPushed) pushedLastTick.add(id);
    }
    return layout.map((orig) => placed.find((p) => p.i === orig.i) ?? { ...orig });
  },
};

// Stamped at build time (Makefile passes VITE_BUILD_ID); shown in the tab
// console and on the wordmark so a stale cached bundle is immediately obvious.
const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? "dev";
console.info(`hearth build ${BUILD_ID}`);

// Guide geometry mirrors RGL defaults: 10px margins/padding, 72px rows.
/** Grid guides shown while a drag/resize gesture is in progress. */
function GridGuides({ rows }: { rows: number }) {
  return (
    <div className="grid-guides" aria-hidden>
      {Array.from({ length: rows * GRID_COLS }, (_, i) => (
        <div key={i} className="grid-guide-cell" />
      ))}
    </div>
  );
}

// Two modes. VIEW (default): clean cards, fully interactive content,
// nothing draggable/resizable/removable. EDIT ("Edit layout"): chrome bars
// appear as drag grips with a remove ✕, edge handles resize on hover, the
// tray adds widgets, guides show during gestures, and every change
// auto-saves on gesture end — "Done" just returns to view mode.
export default function App() {
  const [views, setViews] = useState<View[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  editingRef.current = editing;
  const [interacting, setInteracting] = useState(false);
  // Live grid positions accumulate here between gestures; re-rendering per
  // drag tick would cancel the drag, so this stays out of React state.
  const liveLayoutRef = useRef<Layout | null>(null);
  // Widget slug being dragged from the tray.
  const dragSlugRef = useRef<string | null>(null);
  const { width, containerRef, mounted } = useContainerWidth();
  const { confirm, confirmDialog } = useConfirm();
  const [managingViews, setManagingViews] = useState(false);
  const connection = useConnectionState();
  // Debounce the offline banner so sub-second blips never flash it.
  const [showOffline, setShowOffline] = useState(false);
  // Widget instance whose settings dialog is open.
  const [configFor, setConfigFor] = useState<string | null>(null);

  const loadViews = useCallback(() => {
    getViews().then(setViews).catch(console.error);
  }, []);

  useEffect(loadViews, [loadViews]);
  useTopic("views", loadViews);

  useEffect(() => {
    if (connection === "connected") {
      setShowOffline(false);
      return;
    }
    const id = setTimeout(() => setShowOffline(true), 2000);
    return () => clearTimeout(id);
  }, [connection]);

  // Kiosk housekeeping: nightly reload keeps week-long sessions fresh
  // (skipped while someone is mid-edit; retried an hour later).
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      id = setTimeout(() => {
        if (editingRef.current) schedule(60 * 60 * 1000);
        else window.location.reload();
      }, delay);
    };
    schedule(msUntilNightlyReload(new Date()));
    return () => clearTimeout(id);
  }, []);

  // After a stretch with no touches, return to the default view and leave
  // edit mode — the wall screen should always come back to rest.
  useEffect(() => {
    const idleMs = idleReturnMs(window.location.search);
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, touch, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - last < idleMs) return;
      last = Date.now();
      setEditing(false);
      setActiveId(null); // null falls back to the default view
      setManagingViews(false);
      setConfigFor(null);
    }, 1000);
    return () => {
      clearInterval(id);
      for (const ev of events) window.removeEventListener(ev, touch);
    };
  }, []);

  const active: View | undefined = useMemo(
    () => views.find((v) => v.id === activeId) ?? views.find((v) => v.isDefault) ?? views[0],
    [views, activeId],
  );

  const items = active?.layout ?? [];
  const gridLayout: Layout = items.map(({ i, x, y, w, h }) => ({
    i,
    x,
    y,
    w: Math.max(w, MIN_WIDGET_W),
    h: Math.max(h, MIN_WIDGET_H),
    minW: MIN_WIDGET_W,
    minH: MIN_WIDGET_H,
  }));

  const persist = useCallback(
    (layout: Layout | null) => {
      if (!active) return;
      const merged = mergePositions(active.layout, layout ?? liveLayoutRef.current);
      updateView(active.id, active.name, merged).catch(console.error);
    },
    [active],
  );

  const onLayoutChange = useCallback((layout: Layout) => {
    liveLayoutRef.current = layout;
  }, []);

  const gestureStart = useCallback((layout: Layout, oldItem: GridPos | null) => {
    gestureHomes.clear();
    for (const it of layout) gestureHomes.set(it.i, { x: it.x, y: it.y });
    gestureItemId = oldItem?.i ?? null;
    setInteracting(true);
  }, []);
  const gestureStop = useCallback(
    (layout: Layout) => {
      // Final placement is strict: drop the hysteresis so a widget that was
      // only sticky-pushed springs home, then persist the settled layout.
      pushedLastTick.clear();
      const settled = freePlacement.compact(layout, GRID_COLS);
      gestureHomes.clear();
      gestureItemId = null;
      setInteracting(false);
      persist(settled);
    },
    [persist],
  );

  const addWidget = (slug: string) => {
    const def = widgetRegistry[slug];
    if (!def || !active) return;
    const merged = mergePositions(active.layout, liveLayoutRef.current);
    const { w, h } = def.defaultSize;
    const spot = firstFit(merged, w, h);
    const n = merged.filter((item) => item.widget === slug).length + 1;
    updateView(active.id, active.name, [
      ...merged,
      { i: `${slug}-${n}-${Date.now().toString(36)}`, widget: slug, ...spot, w, h, config: {} },
    ]).catch(console.error);
  };

  const removeWidget = (instanceId: string, title: string) => {
    if (!active) return;
    confirm(
      {
        title: `Remove ${title}?`,
        description: `The ${title} widget will be removed from this view. Its data is kept — add it back any time.`,
        actionLabel: "Remove",
      },
      () => {
        const merged = mergePositions(active.layout, liveLayoutRef.current);
        updateView(
          active.id,
          active.name,
          merged.filter((item) => item.i !== instanceId),
        ).catch(console.error);
      },
    );
  };

  const saveConfig = (instanceId: string, config: Record<string, unknown>) => {
    if (!active) return;
    const merged = mergePositions(active.layout, liveLayoutRef.current);
    updateView(
      active.id,
      active.name,
      merged.map((item) => (item.i === instanceId ? { ...item, config } : item)),
    ).catch(console.error);
    setConfigFor(null);
  };

  // Drop from the tray: the grid tells us where the preview landed.
  const onDrop = (layout: Layout, item: GridPos | undefined) => {
    pushedLastTick.clear();
    gestureHomes.clear();
    gestureItemId = null;
    setInteracting(false);
    const slug = dragSlugRef.current;
    dragSlugRef.current = null;
    if (!slug || !item || !active) return;
    const def = widgetRegistry[slug];
    if (!def) return;
    const merged = mergePositions(active.layout, layout);
    const { w, h } = def.defaultSize;
    // Land on the drop cell if it's free; otherwise take the nearest fit
    // instead of overlapping whatever is already there.
    const occupied = merged.some(
      (it) =>
        item.x < it.x + it.w && it.x < item.x + w && item.y < it.y + it.h && it.y < item.y + h,
    );
    const spot = occupied ? firstFit(merged, w, h) : { x: item.x, y: item.y };
    const n = merged.filter((it) => it.widget === slug).length + 1;
    updateView(active.id, active.name, [
      ...merged,
      { i: `${slug}-${n}-${Date.now().toString(36)}`, widget: slug, ...spot, w, h, config: {} },
    ]).catch(console.error);
  };

  return (
    <div className="app">
      <HStack as="header" className="app-header" gap={4} align="center">
        <span title={`build ${BUILD_ID}`}>
          <Heading level={1} className="app-title">
            Hearth
          </Heading>
        </span>
        <HStack as="nav" gap={1.5} className="flex-1">
          {views.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === active?.id ? "primary" : "ghost"}
              label={v.name}
              onClick={() => setActiveId(v.id)}
            />
          ))}
          {editing && (
            <IconButton
              size="sm"
              variant="ghost"
              label="Manage views"
              icon={<Icon icon="wrench" size="sm" />}
              onClick={() => setManagingViews(true)}
            />
          )}
        </HStack>
        <Button
          size="sm"
          variant={editing ? "primary" : "secondary"}
          label={editing ? "Done" : "Edit layout"}
          onClick={() => setEditing(!editing)}
        />
      </HStack>

      {showOffline && (
        <Banner
          status="warning"
          container="section"
          title="Reconnecting…"
          description="The board can't reach the Hearth server. It will catch up automatically."
        />
      )}

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
        {interacting && (
          <GridGuides
            rows={Math.max(9, items.reduce((m, it) => Math.max(m, it.y + it.h), 0) + 4)}
          />
        )}
        {mounted && active && (
          <GridLayout
            width={width}
            layout={gridLayout}
            gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT }}
            compactor={freePlacement}
            dragConfig={{ enabled: editing, handle: ".widget-chrome", cancel: ".no-drag" }}
            // No top handles: the chrome bar owns the top edge as drag grip.
            resizeConfig={{
              enabled: editing,
              handles: ["s", "w", "e", "sw", "se"],
            }}
            dropConfig={{
              enabled: editing,
              defaultItem: { w: 3, h: 3 },
              onDragOver: () => {
                if (gestureHomes.size === 0 && active) {
                  for (const it of active.layout) gestureHomes.set(it.i, { x: it.x, y: it.y });
                }
                setInteracting(true);
                const def = dragSlugRef.current ? widgetRegistry[dragSlugRef.current] : null;
                return def ? { w: def.defaultSize.w, h: def.defaultSize.h } : undefined;
              },
            }}
            onDrop={onDrop}
            onDragStart={gestureStart}
            onDragStop={gestureStop}
            onResizeStart={gestureStart}
            onResizeStop={gestureStop}
            onLayoutChange={onLayoutChange}
          >
            {items.map((item) => {
              const def = widgetRegistry[item.widget];
              const title = def?.title ?? item.widget;
              return (
                <div key={item.i} className="widget-card">
                  {editing && (
                    <div className="widget-chrome" title="Drag to move">
                      <Text type="supporting" size="xsm" className="widget-chrome-title">
                        {title}
                      </Text>
                      <HStack gap={0.5} className="no-drag">
                        {def?.settings && (
                          <IconButton
                            size="sm"
                            variant="ghost"
                            label={`${title} settings`}
                            icon={<Icon icon="wrench" size="sm" />}
                            onClick={() => setConfigFor(item.i)}
                          />
                        )}
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={`Remove ${title}`}
                          icon={<Icon icon="close" size="sm" />}
                          onClick={() => removeWidget(item.i, title)}
                        />
                      </HStack>
                    </div>
                  )}
                  <div className="widget-content">
                    {def ? (
                      <def.component item={item} />
                    ) : (
                      <div className="widget-unknown">Unknown widget: {item.widget}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}
      </main>
      {managingViews && (
        <ViewManager
          views={views}
          onSwitch={(id) => setActiveId(id)}
          onClose={() => setManagingViews(false)}
        />
      )}
      {configFor &&
        (() => {
          const item = items.find((it) => it.i === configFor);
          const def = item ? widgetRegistry[item.widget] : undefined;
          if (!item || !def?.settings) return null;
          return (
            <Dialog isOpen width={420} onOpenChange={(open) => !open && setConfigFor(null)}>
              <VStack gap={3} className="cal-dialog-body">
                <Heading level={2}>{def.title} settings</Heading>
                <def.settings config={item.config} save={(cfg) => saveConfig(item.i, cfg)} />
              </VStack>
            </Dialog>
          );
        })()}
      {confirmDialog}
    </div>
  );
}
