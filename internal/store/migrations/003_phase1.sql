-- Chores: simple interval recurrence ("every N days"). RRULE-grade rules
-- can come later; nobody washes sheets on the second Tuesday of the month.
CREATE TABLE chores (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    every_days INTEGER NOT NULL DEFAULT 7,
    last_done  TEXT, -- YYYY-MM-DD, NULL until first completion
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chore_completions (
    id         INTEGER PRIMARY KEY,
    chore_id   INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    done_on    TEXT NOT NULL, -- YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE grocery_items (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    checked    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE medications (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    person     TEXT NOT NULL DEFAULT '',
    times      TEXT NOT NULL DEFAULT '[]', -- JSON array of "HH:MM" dose slots
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE medication_logs (
    id            INTEGER PRIMARY KEY,
    medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    day           TEXT NOT NULL, -- YYYY-MM-DD
    slot          TEXT NOT NULL, -- matches an entry in medications.times
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (medication_id, day, slot)
);

INSERT INTO chores (title, every_days) VALUES
    ('Water plants', 3),
    ('Wash sheets', 7);
