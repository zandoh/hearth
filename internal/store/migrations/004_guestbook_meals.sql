-- Guest book: sticky notes guests leave on the guest view.
CREATE TABLE guestbook_notes (
    id         INTEGER PRIMARY KEY,
    author     TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT 'yellow',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Weekly meal plan: one optional entry per day and meal slot.
CREATE TABLE meal_entries (
    id   INTEGER PRIMARY KEY,
    day  TEXT NOT NULL, -- YYYY-MM-DD
    slot TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
    text TEXT NOT NULL,
    UNIQUE (day, slot)
);
