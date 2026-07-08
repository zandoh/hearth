# Hearth HTTP API reference

Hearth is an **API-first backend**: the embedded web app is its first client,
and a future mobile/PWA client talks to the same surface. This document
enumerates every route, its verb, its request body, its success status, and the
[Topic](../CONTEXT.md#language) each mutation publishes on — enough to build a
second client without reading Go source.

The vocabulary here (**Widget**, **Topic**, **View**, **Setting**, **Guest
mode**, **Publish-on-write**) is defined in [CONTEXT.md](../CONTEXT.md).

## Overview

- **Base path**: every endpoint is under `/api`. Anything else is the embedded
  single-page app.
- **Bodies**: requests and responses are JSON (`Content-Type:
  application/json`), except `GET /api/stream` (an event stream) and
  `GET /api/backup` (a binary database download).
- **No authentication**: Hearth is **LAN-trust by design** — no tokens, no
  sessions. Anyone who can reach the port can read and change everything. Do
  not expose it directly to the internet; see [SECURITY.md](../SECURITY.md).
  The guest PIN is a social lock, not an auth boundary.

### Error contract

Errors carry a JSON body `{"error": "message"}` (owned by
`internal/httpx`). The status mapping is uniform across platform and widget
routes:

| Situation | Status | Body |
|---|---|---|
| Malformed `{id}` in the path | `400` | `{"error":"invalid id"}` |
| Body that doesn't parse as JSON | `400` | `{"error":"invalid request body"}` |
| Field validation failure | `400` | `{"error":"<reason>"}` (e.g. `"name is required"`) |
| Record not found (`store.ErrNotFound`) | `404` | `{"error":"not found"}` |
| Any internal error | `500` | `{"error":"internal error"}` — details are logged server-side, never returned |

Two routes add a domain-specific status on top of that baseline:

- The calendar routes return `409` `{"error":"google account not connected"}`
  when an operation needs a Google connection that isn't present.
- The guest-PIN routes return `403` when the supplied PIN is wrong
  (`{"error":"current PIN is incorrect"}` / `{"error":"incorrect PIN"}`).

## Realtime (SSE)

`GET /api/stream` is a single [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
stream (`Content-Type: text/event-stream`). Every connected client receives
every event and filters client-side by topic. The stream opens with a comment
line (`: connected`), then emits one `data:` line per event:

```
data: {"topic":"grocery","data":"changed"}
```

The envelope is `{"topic": string, "data": any}`. For mutations the payload is
the string `"changed"`, which means **re-fetch whatever you show for that
topic** — the event is a nudge, not a diff. (Some background jobs publish richer
payloads, e.g. the clock's tick, but a client can treat any event on a topic as
"re-fetch".)

**Topics** are the widget ids plus the platform concepts:

| Kind | Topics |
|---|---|
| Widget (each equals the widget's id) | `clock`, `calendar`, `chores`, `grocery`, `meds`, `weather`, `guestbook`, `mealplan` |
| Platform | `views`, `profiles`, `night`, `guest` |

The contract lives in `internal/topics` and is mirrored by
`web/src/topics.ts`. See the [Topic](../CONTEXT.md#language) definition for the
full rules.

## Platform routes

Registered in `internal/server`. The **Publishes** column is the topic each
mutating handler announces on (its `s.changed(..., topics.X, ...)` call);
`GET`s and pure checks publish nothing.

### Health & discovery

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/healthz` | — | `200` `{"status":"ok"}` | — |
| GET | `/api/widgets` | — | `200` — JSON array of registered widget ids | — |
| GET | `/api/stream` | — | `200` `text/event-stream` (see [Realtime](#realtime-sse)) | — |

### Views

A **View** is a named grid layout. `layout` is an array of placement items
`{i, widget, x, y, w, h, config}` (`config` is opaque per-widget JSON).

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/views` | — | `200` — array of views | — |
| POST | `/api/views` | `{name, layout[]}` | `201` — the created view | `views` |
| PUT | `/api/views/{id}` | `{name, layout[]}` | `200` — the updated view | `views` |
| DELETE | `/api/views/{id}` | — | `204` (`400` if it's the last view) | `views` |
| POST | `/api/views/{id}/default` | — | `204` | `views` |
| POST | `/api/views/{id}/guest` | — | `204` — id `0` clears the guest view | `guest` + `views` |
| PUT | `/api/views/{id}/schedule` | `{start, end}` — both `HH:MM`, or both `""` to clear | `204` | `views` |
| PUT | `/api/views/order` | `{ids: [int]}` | `204` | `views` |
| PUT | `/api/views/{id}/hidden` | `{hidden: bool}` | `204` | `views` |

### Guest mode

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/guest` | — | `200` `{pinSet, guestViewId}` | — |
| POST | `/api/guest/pin` | `{pin, currentPin}` — empty `pin` clears it; changing an existing PIN requires `currentPin` (min 4 chars) | `200` `{"status":"ok"}` (`403` on wrong `currentPin`) | `guest` |
| POST | `/api/guest/verify` | `{pin}` | `200` `{"status":"ok"}` (`403` on wrong pin) | — |

### Night dimming

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/night` | — | `200` `{enabled, start, end, level}` | — |
| PUT | `/api/night` | `{enabled, start, end, level}` — `start`/`end` are `HH:MM`; `level` 0.2–0.85 | `200` — the saved config | `night` |

### Profiles

Household **Profiles** are the people behind chore assignees and med owners.

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/profiles` | — | `200` — array of profiles | — |
| POST | `/api/profiles` | `{name, color}` — `color` is `#RRGGBB` (defaults to `#D97742`) | `201` — the created profile | `profiles` |
| PUT | `/api/profiles/{id}` | `{name, color}` | `204` | `profiles` |
| DELETE | `/api/profiles/{id}` | — | `204` | `profiles` + `chores` + `meds` (deleting a person unassigns their chores and meds) |

### Onboarding

First-boot starter templates for a pristine install.

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/onboarding` | — | `200` `{needed: bool}` | — |
| POST | `/api/onboarding` | `{template}` — one of `family`, `kitchen`, `simple`, `scratch` | `200` `{"needed":false}` | `views` |

### Backup

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/backup` | — | `200` — a fresh SQLite snapshot (`Content-Type: application/vnd.sqlite3`, `Content-Disposition: attachment`) | — |

## Widget routes

Each **Widget** mounts its routes under `/api/widgets/{id}/` and — via
`widget.Base.Changed` — publishes `"changed"` on its **own id** at the end of
every mutation. So unless noted, the **Publishes** topic equals the widget id.

### clock

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/clock/now` | — | `200` `{now, zone}` | — |

The clock also publishes on the `clock` topic every 30s from a background job.

### calendar

Local household calendars plus any number of Google Calendars, merged into one
event feed. Google writes go through to Google immediately.

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/calendar/calendars` | — | `200` — array of calendars | — |
| POST | `/api/widgets/calendar/calendars` | `{name, color, googleId}` — a non-empty `googleId` makes it a Google calendar (color defaults to `#4f6df5`) | `201` — the created calendar | `calendar` |
| PUT | `/api/widgets/calendar/calendars/{id}` | `{name, color, enabled}` | `200` — the updated calendar | `calendar` |
| DELETE | `/api/widgets/calendar/calendars/{id}` | — | `204` — removes it from Hearth only, not from Google | `calendar` |
| GET | `/api/widgets/calendar/events` | — | `200` — array of events; requires `?start=&end=` (RFC3339) | — |
| POST | `/api/widgets/calendar/events` | `{calendarId, title, startsAt, endsAt, allDay, location, notes}` — times are RFC3339, or `YYYY-MM-DD` when `allDay`; `endsAt` defaults to +1h (or +1 day all-day) | `201` — the created event | `calendar` |
| PUT | `/api/widgets/calendar/events/{id}` | same as POST | `200` — the updated event | `calendar` |
| DELETE | `/api/widgets/calendar/events/{id}` | — | `204` | `calendar` |
| POST | `/api/widgets/calendar/sync` | — | `200` `{"status":"synced"}` | `calendar` (only when a sync brought in changes) |
| GET | `/api/widgets/calendar/google/status` | — | `200` `{configured, connected, email}` | — |
| GET | `/api/widgets/calendar/google/connect` | — | `302` redirect to Google's consent screen (`409` if OAuth creds aren't configured) | — |
| GET | `/api/widgets/calendar/google/callback` | — | `302` redirect back to `/` — the OAuth redirect target; not called directly | `calendar` (on success) |
| GET | `/api/widgets/calendar/google/available` | — | `200` — array of `{googleId, name, color, primary, added}` Google calendars offered to add (`409` if not connected) | — |
| POST | `/api/widgets/calendar/google/disconnect` | — | `200` `{"status":"disconnected"}` | `calendar` |

Calendar routes may return `409` `{"error":"google account not connected"}`
when an operation needs a Google connection that isn't present.

### chores

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/chores` | — | `200` — array of chores with due math (`dueOn`, `dueIn`, `neverDone`, `oneOff`) | — |
| POST | `/api/widgets/chores` | `{title, everyDays, assigneeId}` — `everyDays` 0 is a one-off | `201` — the created chore | `chores` |
| POST | `/api/widgets/chores/{id}/complete` | — | `200` `{"status":"done"}` | `chores` |
| DELETE | `/api/widgets/chores/{id}` | — | `204` | `chores` |

### grocery

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/grocery` | — | `200` — array of items | — |
| POST | `/api/widgets/grocery` | `{name}` | `201` — the created item | `grocery` |
| POST | `/api/widgets/grocery/{id}/toggle` | — | `200` `{"status":"toggled"}` | `grocery` |
| POST | `/api/widgets/grocery/clear-checked` | — | `200` `{"status":"cleared"}` | `grocery` |
| DELETE | `/api/widgets/grocery/{id}` | — | `204` | `grocery` |

### guestbook

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/guestbook` | — | `200` — array of notes | — |
| POST | `/api/widgets/guestbook` | `{author, message, color}` — `message` ≤ 280 chars; `color` is `yellow`/`pink`/`blue`/`green` (defaults `yellow`) | `201` — the created note | `guestbook` |
| DELETE | `/api/widgets/guestbook/{id}` | — | `204` | `guestbook` |
| PUT | `/api/widgets/guestbook/{id}/position` | `{x, y}` — fractions 0–1 of the wall, clamped server-side | `204` | `guestbook` |

### mealplan

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/mealplan/week` | — | `200` `{start, entries}`; optional `?start=YYYY-MM-DD` (a Sunday), defaults to the current week | — |
| PUT | `/api/widgets/mealplan/entry` | `{day, slot, text}` — `day` is `YYYY-MM-DD`, `slot` is `breakfast`/`lunch`/`dinner`; empty `text` clears the slot | `200` `{"status":"saved"}` | `mealplan` |

### meds

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/meds/today` | — | `200` `{day, medications[]}` with per-dose `taken` state | — |
| POST | `/api/widgets/meds` | `{name, person, profileId, times[]}` — each time is `AM`, `PM`, `daily`, `weekly`, or `HH:MM` | `201` — the created medication | `meds` |
| DELETE | `/api/widgets/meds/{id}` | — | `204` | `meds` |
| POST | `/api/widgets/meds/{id}/toggle` | `{slot}` — one of the medication's dose slots | `200` `{"taken": bool}` | `meds` |

### weather

Current conditions and forecast from Open-Meteo (no API key). Served from an
in-memory cache refreshed by a background job.

| Method | Path | Body | Success | Publishes |
|---|---|---|---|---|
| GET | `/api/widgets/weather/forecast` | — | `200` `{configured, [pending], [forecast]}` | — |
| GET | `/api/widgets/weather/geocode` | — | `200` — array of `{name, latitude, longitude}`; requires `?q=` | — |
| PUT | `/api/widgets/weather/location` | `{name, latitude, longitude}` | `200` — the saved location | `weather` (via the immediate refresh) |
| PUT | `/api/widgets/weather/units` | `{units}` — `imperial` or `metric` | `200` `{units}` | `weather` (via the immediate refresh) |

## Keeping this current

This reference is **hand-maintained** and can drift from the code. Every new or
renamed route, changed body shape, or changed topic must update this file in the
same PR (the [add-a-widget checklist](../internal/README.md#adding-a-widget) is
the place a new widget's routes get remembered).

**Open question**: should this be *generated* instead? The pieces are already
first-class — the widget registry knows every widget id, `internal/topics`
owns the topic contract, and each widget's `Routes(mux)` is the authoritative
route table. A follow-up spike could derive the reference (or at least a
route/topic manifest) from those so it can't go stale; the request/response body
shapes would still need annotation, so this hand-written file would become the
generator's template rather than disappear. It's an open question, not a
commitment.
