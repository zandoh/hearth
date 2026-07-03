-- Free-form placement on the guest book wall. x/y are fractions of the
-- wall (0..1, top-left of the note); -1 means never placed, which the
-- client scatters deterministically.
ALTER TABLE guestbook_notes ADD COLUMN x REAL NOT NULL DEFAULT -1;
ALTER TABLE guestbook_notes ADD COLUMN y REAL NOT NULL DEFAULT -1;
