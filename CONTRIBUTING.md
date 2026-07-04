# Contributing to hearth

Thanks for wanting to make the household hub better. This is a small,
opinionated project — a few ground rules keep it that way.

## Before you build a feature

Open an issue (or an Ideas discussion) first. Hearth's scope is deliberate:
calm, glanceable, household-shaped. Features that grow API-key treadmills or
corporate-dashboard energy get declined kindly — better to find that out
before you've written the code.

Bug fixes: just send the PR.

## Getting set up

```sh
make dev-api   # Go API on :8080, rebuilds on .go/.sql changes (brew install fswatch)
make dev-web   # Vite on :5173 with HMR, proxies /api
```

Read these before touching code — they're short and they'll save you time:

- [CONTEXT.md](CONTEXT.md) — the project vocabulary. Code, PRs, and reviews
  use these words exactly (Widget, Topic, View, Setting…).
- [web/README.md](web/README.md) — frontend layout and the rules that bite.
- [internal/README.md](internal/README.md) — backend layout, the
  add-a-widget checklist, and the conventions that bite.
- [docs/adr/](docs/adr/) — decisions already made; don't re-litigate them
  in a PR, open a discussion instead.

## The bar for a PR

1. **Conventional Commits v1.0.0** — `type(scope): subject`. This has
   teeth: release notes are generated from commit messages by git-cliff,
   so a malformed message becomes a malformed changelog.
2. **Gates pass locally**: `make test && make lint && make e2e`
   (e2e needs `make build` first and headless Chromium via Playwright).
3. **Behavior changes come with tests.** Pure logic gets unit tests
   (extract it if it's buried in a component/handler — that's the house
   pattern); user-visible flows get an e2e step in the relevant
   per-concern spec under `web/e2e/specs/`.
4. **Verify against both the dev server and the built binary.** They
   differ; the repo learned this the hard way.

CI runs the same gates. Green CI + a conventional title is usually a
same-day review.

## Adding a widget

The full checklist lives in [internal/README.md](internal/README.md). In
short: a Go package implementing the widget contract, a topic constant on
both sides of the mirror (a contract test fails until you do), a React
component + API adapter, and a registry entry. The clock widget is the
smallest complete example.
