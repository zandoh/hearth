import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GridLayout, {
  useContainerWidth,
  type Layout,
  type LayoutItem as GridPos,
} from "react-grid-layout";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Eye, EyeOff, Keyboard as KeyboardGlyph, Moon, Pencil, Sun, SunMoon } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { getViews, updateView } from "./api";
import {
  type GuestConfig,
  getGuestConfig,
  setGuestActive,
  useGuestActive,
  verifyGuestPin,
} from "./guestMode";
import { NightShade } from "./NightShade";
import { Screensaver } from "./Screensaver";
import { createCompactor } from "./compactor";
import { useConfirm } from "./confirm";
import { ViewManager } from "./ViewManager";
import { GRID_COLS, MIN_WIDGET_H, MIN_WIDGET_W, firstFit, mergePositions } from "./layout";
import { idleReturnMs, msUntilNightlyReload, scheduledViewID, screensaverMs } from "./kiosk";
import { OnScreenKeyboard, oskEnabled, setOskEnabled } from "./OnScreenKeyboard";
import { nextThemeMode, setThemeMode, useThemeMode } from "./themeMode";
import { TOPICS } from "./topics";
import { useConnectionState, useTopic } from "./useSSE";
import { widgetRegistry } from "./widgets/registry";
import type { View } from "./types";

const ROW_HEIGHT = 72;

// Stamped at build time (Makefile passes VITE_BUILD_ID); shown in the tab
// console and on the wordmark so a stale cached bundle is immediately obvious.
const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? "dev";
console.info(`hearth build ${BUILD_ID}`);

// Brand mark (Guidelines §1): ember house held in a ring. The ring takes
// the current text color; the house is always ember. Never recolored,
// rotated, stretched, or outlined.
function HearthMark() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden>
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeWidth="4" />
      <polygon points="32,22 41,30 41,41 23,41 23,30" fill="#D97742" />
    </svg>
  );
}

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
  // This grid's free-placement compactor; gesture state lives inside it.
  const [freePlacement] = useState(createCompactor);
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
  const [oskOn, setOskOn] = useState(oskEnabled);
  const guest = useGuestActive();
  const [guestConfig, setGuestConfig] = useState<GuestConfig | null>(null);
  const [exitPin, setExitPin] = useState<string | null>(null); // null = dialog closed
  const [exitError, setExitError] = useState("");
  const [saverOn, setSaverOn] = useState(false);
  const themeMode = useThemeMode();
  const connection = useConnectionState();
  // Debounce the offline banner so sub-second blips never flash it.
  const [showOffline, setShowOffline] = useState(false);
  // Widget instance whose settings dialog is open.
  const [configFor, setConfigFor] = useState<string | null>(null);

  const loadViews = useCallback(() => {
    getViews().then(setViews).catch(console.error);
  }, []);

  useEffect(loadViews, [loadViews]);
  useTopic(TOPICS.views, loadViews);

  const loadGuestConfig = useCallback(() => {
    getGuestConfig().then(setGuestConfig).catch(console.error);
  }, []);
  useEffect(loadGuestConfig, [loadGuestConfig]);
  useTopic(TOPICS.guest, loadGuestConfig);

  // Screensaver: long-idle burn-in protection, woken by any touch.
  useEffect(() => {
    const ms = screensaverMs(window.location.search);
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, touch, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - last >= ms) setSaverOn(true);
    }, 1000);
    return () => {
      clearInterval(id);
      for (const ev of events) window.removeEventListener(ev, touch);
    };
  }, []);

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

  const guestView = useMemo(
    () => views.find((v) => v.id === guestConfig?.guestViewId),
    [views, guestConfig],
  );

  // Scheduled views: while the board is at rest (no manual pick), a view
  // whose daily window contains now takes over; idle-return clears manual
  // picks, so the wall drifts back to the schedule. Re-evaluated twice a
  // minute. Guest mode is resolved before any of this and always wins.
  const [scheduledId, setScheduledId] = useState<number | null>(null);
  useEffect(() => {
    const evaluate = () => setScheduledId(scheduledViewID(views, new Date()));
    evaluate();
    const id = setInterval(evaluate, 30_000);
    return () => clearInterval(id);
  }, [views]);

  const active: View | undefined = useMemo(() => {
    if (guest) return guestView;
    return (
      views.find((v) => v.id === activeId) ??
      views.find((v) => v.id === scheduledId) ??
      views.find((v) => v.isDefault) ??
      views[0]
    );
  }, [guest, guestView, views, activeId, scheduledId]);

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

  const gestureStart = useCallback(
    (layout: Layout, oldItem: GridPos | null) => {
      freePlacement.beginGesture(layout, oldItem?.i ?? null);
      setInteracting(true);
    },
    [freePlacement],
  );
  const gestureStop = useCallback(
    (layout: Layout) => {
      const settled = freePlacement.endGesture(layout, GRID_COLS);
      setInteracting(false);
      persist(settled);
    },
    [freePlacement, persist],
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

  const persistConfig = (instanceId: string, config: Record<string, unknown>) => {
    if (!active) return;
    const merged = mergePositions(active.layout, liveLayoutRef.current);
    updateView(
      active.id,
      active.name,
      merged.map((item) => (item.i === instanceId ? { ...item, config } : item)),
    ).catch(console.error);
  };

  const saveConfig = (instanceId: string, config: Record<string, unknown>) => {
    persistConfig(instanceId, config);
    setConfigFor(null);
  };

  // Drop from the tray: the grid tells us where the preview landed.
  const onDrop = (layout: Layout, item: GridPos | undefined) => {
    freePlacement.cancelGesture();
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

  const enterGuestMode = () => {
    if (!guestConfig?.pinSet) {
      confirm(
        {
          title: "Set a guest PIN first",
          description:
            "Guest mode locks the board until the PIN is entered. Set one under Manage views → Guest mode.",
          actionLabel: "Open view manager",
        },
        () => {
          setEditing(true);
          setManagingViews(true);
        },
      );
      return;
    }
    confirm(
      {
        title: "Enter guest mode?",
        description: guestView
          ? `The board shows only "${guestView.name}" until the guest PIN is entered.`
          : "No guest view is set, so guests see the screensaver. The PIN brings the board back.",
        actionLabel: "Enter guest mode",
      },
      () => {
        setEditing(false);
        setManagingViews(false);
        setGuestActive(true);
      },
    );
  };

  const tryExitGuest = async () => {
    try {
      await verifyGuestPin(exitPin ?? "");
      setExitPin(null);
      setExitError("");
      setGuestActive(false);
    } catch (err) {
      setExitError(err instanceof Error ? err.message : "incorrect PIN");
    }
  };

  // Guest mode with no guest view: the screensaver IS the guest experience.
  // Rendered as an overlay (never an early return) so the board — and
  // react-grid-layout's container-width observer — stay mounted underneath.
  const guestSaver = guest && !guestView;

  return (
    <div className="app">
      <HStack as="header" className="app-header" gap={4} align="center">
        <span className="brand-lockup" title={`build ${BUILD_ID}`}>
          <HearthMark />
          <span className="brand-wordmark">hearth</span>
        </span>
        <HStack as="nav" gap={1.5} className="flex-1">
          {!guest &&
            views.map((v) => (
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
        <IconButton
          size="sm"
          variant={guest ? "secondary" : "ghost"}
          label={guest ? "Exit guest mode" : "Enter guest mode"}
          tooltip={guest ? "Exit guest mode" : "Guest mode"}
          icon={<Icon icon={guest ? EyeOff : Eye} size="sm" />}
          onClick={() => (guest ? setExitPin("") : enterGuestMode())}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={`Theme: ${themeMode} — switch`}
          tooltip={`Theme: ${themeMode}`}
          icon={
            <Icon
              icon={themeMode === "dark" ? Moon : themeMode === "light" ? Sun : SunMoon}
              size="sm"
            />
          }
          onClick={() => setThemeMode(nextThemeMode(themeMode))}
        />
        <IconButton
          size="sm"
          variant={oskOn ? "secondary" : "ghost"}
          label={oskOn ? "Disable on-screen keyboard" : "Enable on-screen keyboard"}
          tooltip="On-screen keyboard"
          icon={<Icon icon={KeyboardGlyph} size="sm" />}
          onClick={() => {
            setOskEnabled(!oskOn);
            setOskOn(!oskOn);
          }}
        />
        {!guest && (
          <IconButton
            size="sm"
            variant={editing ? "primary" : "ghost"}
            label={editing ? "Done editing" : "Edit layout"}
            tooltip={editing ? "Done editing" : "Edit layout"}
            icon={<Icon icon={Pencil} size="sm" />}
            onClick={() => setEditing(!editing)}
          />
        )}
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
            compactor={freePlacement.compactor}
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
                if (!freePlacement.inGesture() && active) {
                  freePlacement.beginGesture(active.layout, null);
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
                      <def.component item={item} saveConfig={(cfg) => persistConfig(item.i, cfg)} />
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
      {guestSaver ? (
        <Screensaver persistent onExitGuest={() => setExitPin("")} />
      ) : (
        saverOn && <Screensaver onWake={() => setSaverOn(false)} />
      )}
      {exitPin !== null && (
        <Dialog isOpen width={360} onOpenChange={(open) => !open && setExitPin(null)}>
          <VStack gap={3} className="cal-dialog-body">
            <Heading level={2}>Exit guest mode</Heading>
            <TextInput
              label="Guest PIN"
              type="password"
              value={exitPin}
              onChange={setExitPin}
              onEnter={tryExitGuest}
              hasAutoFocus
            />
            {exitError && <Text className="form-error">{exitError}</Text>}
            <HStack justify="end" gap={2}>
              <Button size="sm" variant="ghost" label="Cancel" onClick={() => setExitPin(null)} />
              <Button size="sm" variant="primary" label="Unlock" onClick={tryExitGuest} />
            </HStack>
          </VStack>
        </Dialog>
      )}
      <OnScreenKeyboard />
      <NightShade />
    </div>
  );
}
