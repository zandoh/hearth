# hearth — web

The board: a React app embedded into the Go binary at build time. This file
covers the frontend half; the project story is in the [root README](../README.md)
and the shared vocabulary in [CONTEXT.md](../CONTEXT.md) — terms like Widget,
Topic, Widget API adapter, and Mutation discipline are used exactly as
defined there.

## Stack

React 19 + Vite, [Astryx](https://astryx.atmeta.com/) design system,
`react-grid-layout` for the board. Tooling is **bun** end to end; linting is
**oxlint**, formatting **oxfmt**.

## Commands

Run from `web/` (or use the repo-root `make` targets, which wrap these):

```sh
bun run dev          # Vite on :5173/:5174, proxies /api to :8080
bun run build        # tsc + vite build into dist/ (embedded by the Go build)
bun test             # unit tests (pure modules only — see Testing)
bun run lint         # oxlint
bun run fmt          # oxfmt
bun run theme:build  # regenerate theme.css/hearth.js after editing theme.ts
bun e2e/run.mjs      # Playwright suite (needs `make build` first)
bun e2e/shoot.mjs    # re-shoot the README hero screenshots
```

Local development wants two terminals: `make dev-api` (repo root) for the Go
server, `bun run dev` here. **Verify changes against both the dev server and
the built binary** — they differ (a dev-only crash once cost a week).

## Layout

```
src/
  App.tsx            glue: binds the Compactor to react-grid-layout, hosts
                     platform state (edit mode, guest, dialogs)
  kiosk.ts           kiosk math: view selection, schedules, idle thresholds
  compactor.ts       the free-placement layout engine (see CONTEXT.md)
  topics.ts          SSE topic contract — mirror of internal/topics, enforced
                     by topics.test.ts
  api.ts             platform API adapter (views, profiles, night, …)
  use*.ts            deep hooks: useTopicData/useMutate (the mutation
                     discipline), useIdleTimer, usePointerDrag
  widgets/
    registry.ts      widget slug -> component + settings + default size
    <Name>Widget.tsx one component per widget
    <name>Api.ts     the widget's API adapter — widgets never hold URLs
    *.ts             extracted pure logic (timeGrid, countdown, eventTags…)
  theme.ts           brand theme SOURCE — edit this, then `bun run theme:build`
  theme.css/hearth.* GENERATED — never edit by hand (oxfmt ignores them)
```

## Rules that bite

- **Astryx first.** Discover components with `bunx astryx build "<idea>"`
  before writing UI; escape-hatch icons come from lucide through Astryx's
  `Icon`. Custom CSS is limited to what components can't express, always in
  tokens. See `web/.claude/CLAUDE.md` for the full workflow.
- **Astryx dialogs are native `<dialog>`/`showModal()`** — top layer, inert
  outside. Overlays that must work over a modal (the on-screen keyboard)
  portal *into* the topmost open dialog; z-index and popovers lose.
- **Nothing may change under a finger mid-tap.** Focus fires on pointerdown;
  any layout change before pointerup retargets the click to the dialog and
  dismisses it. Mount overlays on the next pointerup, resize a beat later.
- **Pointer drags use `usePointerDrag`.** Window-level listeners (element
  capture dies when a dragged node re-slots) and ref-carried payloads (touch
  bursts outrun React renders) are already solved there.
- **Widgets adapt to their own width** with container queries
  (`@container` on `.widget-content`), never viewport media queries.
- **Extract pure logic to a `.ts` and table-test it** — timeGrid, countdown,
  eventTags, kiosk are the pattern. Components stay presentational.

## Testing

Unit tests target pure modules only (bun test, 9 files). Everything
DOM-shaped is covered by the e2e suite: one spec per concern under
`e2e/specs/`, each booted against a fresh binary and throwaway database by
`e2e/run.mjs`. `helpers.seedView` answers first-boot onboarding away — a
seeded single-clock layout is otherwise indistinguishable from a pristine
install.
