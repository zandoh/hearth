# Hearth

A self-hosted home hub for an always-on touchscreen: a widget grid the whole
household shares — calendar, chores, groceries, weather — with rearrangeable
layouts saved as named views.

Ships as a **single Go binary** with the web app embedded. The web UI is the
first client of an API-first backend; a future mobile app talks to the same
API.

## Stack

- **Backend**: Go, standard library first — `net/http` routing, SSE for
  realtime (no WebSocket dependency), SQLite via `modernc.org/sqlite`
  (pure Go, no CGo).
- **Frontend**: React + Vite + [Astryx](https://astryx.atmeta.com/) design
  system, `react-grid-layout` for the drag-to-arrange grid. Tooling runs on
  **bun**, linted with **oxlint**, formatted with **oxfmt**.

## Quick start

```sh
make build   # builds web/ with bun, embeds it, produces bin/hearth
./bin/hearth # serves everything on :8080, creates hearth.db
```

Flags: `-addr :8080`, `-db hearth.db`.

## Development

Two terminals:

```sh
make dev-api   # Go API on :8080
make dev-web   # Vite dev server on :5173, proxies /api to :8080
```

Checks:

```sh
make test   # go test
make lint   # go vet + staticcheck + oxlint + oxfmt --check
make fmt    # gofmt + oxfmt
```

## Architecture

Everything is a **widget** conforming to one contract, wired in exactly two
places:

- **Server** (`internal/widgets/<name>/`): implements `widget.Widget` —
  `ID()`, `Routes(mux)` for its API under `/api/widgets/<id>/`, and `Jobs()`
  for recurring background work (sync, refresh). Registered once in
  `cmd/hearth/main.go`.
- **Client** (`web/src/widgets/`): a React component registered in
  `web/src/widgets/registry.ts` under the same slug.

Widgets publish realtime updates through the SSE hub (`internal/sse`); the
frontend holds one `EventSource` on `/api/stream` and components subscribe to
topics with `useTopic`.

**Views** are named grid layouts (`views` table): a JSON array of
`{i, widget, x, y, w, h, config}`. The Edit button on the kiosk toggles
drag/resize; Save writes the layout back via `PUT /api/views/{id}`.

The clock widget (`internal/widgets/clock`, `web/src/widgets/ClockWidget.tsx`)
is the reference implementation of the whole contract.

### Layout

```
cmd/hearth/          entrypoint: flags, wiring, graceful shutdown
internal/server/     HTTP API assembly + embedded SPA serving
internal/store/      SQLite: migrations (embedded .sql) + all queries
internal/sse/        Server-Sent Events hub
internal/widget/     widget contract + registry + job scheduler
internal/widgets/    one package per widget
web/                 Vite + React + Astryx app (bun)
web/embed.go         go:embed of web/dist into the binary
```

## Roadmap

Phase 1: calendar (+ Google Calendar sync), chores, grocery list, weather,
medications. Phase 2: maintenance reminders, profiles, kiosk polish (night
dimming, photo screensaver). Phase 3: utilities trends, notifications, mobile
(PWA).
