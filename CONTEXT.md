# Hearth

A self-hosted home-hub kiosk: one Go binary serving an embedded React board of
widgets, kept live across devices by SSE. This file names the concepts the code
is organized around; use these terms in code, docs, and reviews.

## Language

**Widget**:
A self-contained board feature (chores, meds, calendar…). On the backend, an
implementation of `widget.Widget` registered once in `main`; on the frontend, a
component keyed in the widget registry. A widget's ID is simultaneously its
route prefix, its SSE topic, and its registry key.
_Avoid_: plugin, module (in the generic sense), card

**Topic**:
A named SSE channel. Widgets publish on their own ID; platform concerns publish
on concept names (views, profiles, night, guest). The payload `"changed"` means
"re-fetch". The contract is defined once in `internal/topics` and mirrored by
`web/src/topics.ts` — string literals for topics are a smell.
_Avoid_: channel, event name

**Publish-on-write**:
Every mutation ends by announcing itself on the owning topic. Backend handlers
get this via `widget.Base.Changed` / `Server.changed`; forgetting it is no
longer possible in handlers that use them.

**Setting**:
A typed, keyed value in the store's KV table, accessed through
`store.Setting[T]`, which owns the JSON codec and the "absent means unset"
convention. Raw-string settings (guest PIN hash, guest view id, weather units)
predate the codec and stay raw — do not change a key's on-disk representation.
_Avoid_: config (that's per-widget layout config), preference

**Widget API adapter**:
The frontend module that hides a widget's transport — URLs, verbs, body shapes
— behind named verbs (`choresApi.ts`, `calendarApi.ts`, …). Widgets never
contain URL strings.
_Avoid_: client, service

**Mutation discipline**:
The one blessed mutate flow, provided by `useMutate`: run the request; on
success reload then clear the form; on failure surface the server's error
message. Mutations never rely on SSE for their own refresh (e2e-enforced) and
never swallow errors to the console.

**External API seam**:
A widget's outbound integration isolated behind an unexported Go interface with
a prod adapter and a test fake — calendar's `gcalAPI`/`googleClient` and
weather's `meteoAPI`/`openMeteoClient`. Two adapters make the seam real; new
integrations follow this shape.
_Avoid_: wrapper, client abstraction

**Compactor**:
The free-placement layout engine (`web/src/compactor.ts`): collision-push with
gesture-home snapshots, spring-back, and jiggle hysteresis. Gesture state lives
in the closure returned by `createCompactor()`; App.tsx is only an adapter
binding it to react-grid-layout.

**Guest mode**:
A per-device restricted state: PIN-protected exit, a designated guest view (or
the screensaver when none is set). Configured in ViewManager, enforced in App,
persisted as raw settings.

**View**:
A named board layout (grid of widget placements). One view is the default; the
guest view is a view designated for guest mode.
_Avoid_: page, dashboard, screen
