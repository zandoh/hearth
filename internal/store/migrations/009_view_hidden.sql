-- Views can be hidden from the header switcher (e.g. the guest view):
-- still real, still schedulable, just not in daily navigation.
ALTER TABLE views ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
