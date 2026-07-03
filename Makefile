# Hearth — single-binary home hub.
# `make build` produces bin/hearth with the frontend embedded.

.PHONY: e2e build web run dev-api dev-web test lint fmt clean

build: web
	go build -o bin/hearth ./cmd/hearth

# touch .gitkeep after building: vite empties dist/ but the tracked
# placeholder must survive so go:embed works on a fresh clone
web:
	cd web && bun install && \
	VITE_BUILD_ID="$$(git rev-parse --short HEAD 2>/dev/null || echo local)-$$(date +%m%d.%H%M)" bun run build && \
	touch dist/.gitkeep

run: build
	./bin/hearth

# Development: run these in two terminals, then browse localhost:5173.
# The Vite dev server proxies /api to the Go server on :8080.
# dev-api auto-restarts on .go/.sql changes (fswatch); dev-web has true HMR.
dev-api:
	./scripts/dev-api.sh

dev-api-once:
	go run ./cmd/hearth

dev-web:
	cd web && bun run dev

test:
	go test ./...
	cd web && bun test

e2e: build
	cd web && bun e2e/run.mjs

lint:
	go vet ./...
	go run honnef.co/go/tools/cmd/staticcheck@latest ./...
	cd web && bun run lint && bun run fmt:check

fmt:
	gofmt -w .
	cd web && bun run fmt

clean:
	rm -rf bin web/dist/assets web/dist/index.html
