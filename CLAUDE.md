# Hearth — agent guidance

## Commits
- Conventional Commits v1.0.0, enforced: `type(scope): subject`. Release
  notes are generated from commit messages by git-cliff (cliff.toml +
  release.yml), so a malformed message ends up as a malformed changelog.

## Commands
- `make build` — bun-builds web/, embeds it, produces bin/hearth
- `make test` — Go tests + bun unit tests
- `make e2e` — Playwright suite (web/e2e/, fresh binary + throwaway DB per spec)
- `make lint` / `make fmt` — staticcheck + oxlint / gofmt + oxfmt

## Rules
- Go std-lib-first; frontend uses Astryx (see web/.claude/CLAUDE.md) — no
  hand-rolled UI when a component exists.
- Verify features against BOTH the built binary and the Vite dev server;
  they differ (dev-only crashes have happened).
- Never run tests or dev servers against the repo-root hearth.db — it is
  live household data. Use a throwaway `-db` path (the e2e harness does
  this automatically).
- SQLite pragmas belong in the DSN in store.Open, never via db.Exec
  (per-connection scope; FK enforcement silently vanishes otherwise).
