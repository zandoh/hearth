-- Wire up the profiles table that 001_init scaffolded: chores get an
-- assignee, medications get an owner.
ALTER TABLE chores ADD COLUMN assignee_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE medications ADD COLUMN profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL;

-- Adopt the free-text medication people that predate profiles.
INSERT INTO profiles (name, color)
    SELECT DISTINCT TRIM(person), '#D97742' FROM medications WHERE TRIM(person) != '';
UPDATE medications
    SET profile_id = (SELECT id FROM profiles WHERE profiles.name = TRIM(medications.person))
    WHERE TRIM(person) != '';
