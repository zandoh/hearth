CREATE TABLE profiles (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#7a7a7a',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE views (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    -- JSON array of {i, widget, x, y, w, h, config}
    layout     TEXT NOT NULL DEFAULT '[]',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO views (name, layout, is_default) VALUES (
    'Home',
    '[{"i":"clock-1","widget":"clock","x":0,"y":0,"w":4,"h":3,"config":{}}]',
    1
);
