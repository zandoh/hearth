-- Platform-wide key/value settings (Google OAuth tokens live here).
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE calendars (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#4f6df5',
    kind       TEXT NOT NULL DEFAULT 'local' CHECK (kind IN ('local', 'google')),
    -- Google's calendar id (an email-like string); NULL for local calendars.
    google_id  TEXT UNIQUE,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE events (
    id          INTEGER PRIMARY KEY,
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    -- Google's event id; '' for locally-created events on local calendars.
    external_id TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL,
    -- RFC3339 for timed events, YYYY-MM-DD when all_day.
    starts_at   TEXT NOT NULL,
    ends_at     TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_calendar_time ON events (calendar_id, starts_at);

INSERT INTO calendars (name, kind, color) VALUES ('Household', 'local', '#e07a3f');
