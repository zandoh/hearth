import { useEffect, useSyncExternalStore } from "react";
import { isDemo } from "./demo";
import { onDemoTopic } from "./demo/bus";

// One shared EventSource for the app. Widgets subscribe to topics. EventSource
// reconnects by itself, which an always-on kiosk needs. This module also tracks
// connection health for the offline banner, and after a reconnect sends a synthetic
// "changed" to every subscriber, so widgets re-fetch what they missed.

type Handler = (data: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;

export type ConnectionState = "connected" | "reconnecting";

let connectionState: ConnectionState = "connected";
const connectionListeners = new Set<() => void>();
let hadDrop = false;

function setConnectionState(next: ConnectionState) {
  if (connectionState === next) return;
  connectionState = next;
  for (const l of connectionListeners) l();
}

let demoBridged = false;

function ensureSource() {
  if (isDemo) {
    // No stream on GitHub Pages: bridge the demo bus into the same handler map, once. The
    // connection is always healthy.
    if (!demoBridged) {
      demoBridged = true;
      onDemoTopic((topic) => handlers.get(topic)?.forEach((h) => h("changed")));
    }
    return;
  }
  if (source) return;
  source = new EventSource("/api/stream");
  source.onopen = () => {
    setConnectionState("connected");
    if (hadDrop) {
      hadDrop = false;
      // Catch up: anything could have changed while we were offline.
      for (const set of handlers.values()) {
        for (const h of set) h("changed");
      }
    }
  };
  source.onerror = () => {
    hadDrop = true;
    setConnectionState("reconnecting");
    // EventSource gives up in some failure modes (readyState CLOSED). Recreate it, so the
    // kiosk always reconnects.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      setTimeout(ensureSource, 5000);
    }
  };
  source.onmessage = (e) => {
    const { topic, data } = JSON.parse(e.data) as { topic: string; data: unknown };
    handlers.get(topic)?.forEach((h) => h(data));
  };
}

export function useTopic(topic: string, handler: Handler) {
  useEffect(() => {
    ensureSource();
    let set = handlers.get(topic);
    if (!set) {
      set = new Set();
      handlers.set(topic, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }, [topic, handler]);
}

/** Live SSE connection health, for the offline banner. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    () => connectionState,
  );
}
