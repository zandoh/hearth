# hearth — backend

The single Go binary: API, SSE, widget jobs, SQLite, and the embedded web
app. This file covers the Go half; the project story is in the
[root README](../README.md) and the shared vocabulary in
[CONTEXT.md](../CONTEXT.md). Standard library first — the only runtime
dependency is `modernc.org/sqlite`.

## Packages

```
cmd/hearth/     entrypoint: flags (-addr, -db, -restore, -reset-guest-pin),
                .env loading, wiring, backup scheduler, graceful shutdown
internal/
  server/       platform HTTP handlers (views, guest, night, profiles,
                onboarding, backup) + embedded SPA serving
  store/        SQLite: embedded migrations + every query. Handlers never
                touch database/sql.
  sse/          the SSE hub — one /api/stream, topics fan out
  topics/       the SSE topic contract (mirrored by web/src/topics.ts,
                enforced by a contract test on the web side)
  httpx/        request/response conventions: Decode, ID, Fail (ErrNotFound
                -> 404, internals never leak), JSON
  widget/       the widget contract: Base (publish-on-write via Changed),
                Registry, job scheduler
  widgets/      one package per widget
```

## Adding a widget

1. `internal/widgets/<name>/` implementing `widget.Widget` — embed
   `widget.Base{Hub: hub, Slug: topics.<Name>}`; routes under
   `/api/widgets/<name>/`; end every mutation with `Base.Changed`.
2. Add the topic constant to `internal/topics` **and** `web/src/topics.ts`
   (the contract test fails until both exist).
3. Register once in `cmd/hearth/main.go`; add the frontend half per
   `web/README.md`.
4. Data: a numbered migration in `store/migrations/` plus a `store/<name>.go`
   with one `<name>Cols` constant and one scan function per table.
5. Document the new routes, body shapes, and published topic in
   [`docs/api.md`](../docs/api.md) — it's hand-maintained and drifts otherwise.

The clock widget is the smallest complete example; calendar is the largest
(external API seam, sync job, write-through).

## Conventions that bite

- **SQLite pragmas ride in the DSN** (`store.Open`), never `db.Exec` — Exec
  configures one pooled connection and FK enforcement silently vanishes on
  the rest. Don't "simplify" this.
- **Settings**: new keys use `store.Setting[T]`. Three legacy keys are raw
  strings on purpose — see `docs/adr/0001` before touching them.
- **External APIs** sit behind an unexported interface with a prod adapter
  and a test fake (calendar's `gcalAPI`, weather's `meteoAPI`). Two adapters
  make the seam real; new integrations copy the shape.
- **Write-throughs run under `context.WithoutCancel`** — a kiosk browser
  dropping the connection mid-delete must not abandon the mutation after the
  remote side applied it. And "already gone" (404/410) is a successful
  delete.
- **Migrations are append-only** and run in a transaction per file; check
  `001_init.sql` before creating a table — it may already be scaffolded.

## Testing

- Store and widget tests boot a real temp-SQLite store (`openTestStore`,
  `newTestWidget`) — cheap enough that there is no store interface.
- Platform handlers test through `newTestServer` (`server_test.go`):
  httptest over a real store and hub, `fstest.MapFS` for the dist.
- External integrations test against their fakes; the Google client's HTTP
  behaviour (410-tolerant deletes) tests via a static `RoundTripper`.

Run everything with `make test` (Go + bun) and `make e2e` from the repo root.
