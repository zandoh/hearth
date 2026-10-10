// Demo mode's stand-in for the SSE hub: an in-page topic emitter. The demo API
// publishes here after each mutation, and useSSE bridges it into the handler map that
// real SSE feeds, so publish-on-write works within this tab.

type Listener = (topic: string) => void;

const listeners = new Set<Listener>();

export function publishDemo(topic: string) {
  // Next tick, like a network round-trip, so React updates stay out of the mutation
  // call stack.
  setTimeout(() => {
    for (const l of listeners) l(topic);
  }, 0);
}

export function onDemoTopic(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
