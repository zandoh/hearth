-- Scheduled views: a view may claim a daily HH:MM window during which the
-- kiosk shows it automatically, falling back to the default view outside
-- any window. NULL = unscheduled.
ALTER TABLE views ADD COLUMN schedule_start TEXT;
ALTER TABLE views ADD COLUMN schedule_end TEXT;
