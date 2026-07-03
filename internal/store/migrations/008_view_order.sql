-- Explicit view ordering for the header switcher; seeded from id so
-- existing installs keep their current order.
ALTER TABLE views ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE views SET sort_order = id;
