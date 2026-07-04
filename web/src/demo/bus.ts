// Demo mode's stand-in for the SSE hub: an in-page topic emitter. The demo
// API publishes here after every mutation, and useSSE bridges it into the
// same handler map real SSE feeds — so publish-on-write keeps working,
// scoped to this tab, which is all a sandbox needs.

type Listener = (topic: string) => void;

const listeners = new Set<Listener>();

export function publishDemo(topic: string) {
  // Next tick, like a network round-trip would be — keeps React updates
  // out of the mutation call stack.
  setTimeout(() => {
    for (const l of listeners) l(topic);
  }, 0);
}

export function onDemoTopic(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
