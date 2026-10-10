# Hearth — agent guidance

## Commits
- Conventional Commits v1.0.0, enforced: `type(scope): subject`. git-cliff
  (cliff.toml + release.yml) builds the release notes from commit messages, so
  a malformed message becomes a malformed changelog.

## Commands
- `make build` — bun-builds web/, embeds it, produces bin/hearth
- `make test` — Go tests + bun unit tests
- `make e2e` — Playwright suite (web/e2e/, fresh binary + throwaway DB per spec)
- `make lint` / `make fmt` — staticcheck + oxlint / gofmt + oxfmt

## Rules
- Go std-lib-first. The frontend uses Astryx (see web/.claude/CLAUDE.md): no
  hand-rolled UI when a component exists.
- Verify features against BOTH the built binary and the Vite dev server. They
  differ (dev-only crashes happened).
- Never run tests or dev servers against the repo-root hearth.db — it is
  live household data. Use a throwaway `-db` path (the e2e harness does
  this automatically).
- SQLite pragmas belong in the DSN in store.Open, never via db.Exec
  (pragmas are per connection, so FK enforcement silently stops otherwise).
