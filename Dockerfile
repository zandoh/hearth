# Hearth — single-binary home hub. Multi-stage: bun builds the frontend,
# Go embeds it into a static binary, distroless runs it.

FROM oven/bun:1 AS web
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ .
ARG BUILD_ID=docker
RUN VITE_BUILD_ID=$BUILD_ID bun run build

FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /hearth ./cmd/hearth

# distroless/static: CA certificates included (Google + Open-Meteo need
# HTTPS), no shell, runs as nonroot (uid 65532).
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /hearth /hearth
# Workdir is the data volume: hearth.db lives here, and an optional .env
# placed in the volume is picked up automatically.
WORKDIR /data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/hearth", "-db", "/data/hearth.db", "-addr", ":8080"]
