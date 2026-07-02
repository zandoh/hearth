import { useEffect } from "react";

// One shared EventSource for the whole app; widgets subscribe to topics.
// EventSource reconnects automatically, which is exactly what an always-on
// kiosk needs.

type Handler = (data: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;

function ensureSource() {
  if (source) return;
  source = new EventSource("/api/stream");
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
