#!/usr/bin/env bash
# Dev loop for the Go server: rebuild + restart on every .go/.sql change.
# Uses fswatch (brew install fswatch); falls back to plain `go run` without it.
#
# Go has no hot-module reload — the binary is immutable once running — so the
# dev experience is a fast restart. State survives because it lives in SQLite,
# not the process.
set -u
cd "$(dirname "$0")/.."

if ! command -v fswatch >/dev/null; then
  echo "dev-api: fswatch not found (brew install fswatch); running without auto-restart"
  exec go run ./cmd/hearth "$@"
fi

BIN="$(mktemp -d)/hearth-dev"
PID=""

cleanup() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

while true; do
  if go build -o "$BIN" ./cmd/hearth; then
    "$BIN" "$@" &
    PID=$!
  else
    PID=""
    echo "dev-api: ✗ build failed — fix and save to retry"
  fi
  # Block until any Go source or embedded migration changes.
  fswatch -1 -r -e '.*' -i '\.go$' -i '\.sql$' cmd internal web/embed.go >/dev/null
  echo ""
  echo "dev-api: change detected — restarting"
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
  fi
done
