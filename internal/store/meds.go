package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

type Medication struct {
	ID        int64    `json:"id"`
	Name      string   `json:"name"`
	Person    string   `json:"person"` // legacy free text; profiles supersede it
	ProfileID int64    `json:"profileId,omitempty"`
	Times     []string `json:"times"` // "HH:MM" dose slots
}

// DoseKey identifies one dose checkbox: medication + slot, for a given day.
type DoseKey struct {
	MedicationID int64  `json:"medicationId"`
	Slot         string `json:"slot"`
}

func (s *Store) ListMedications() ([]Medication, error) {
	rows, err := s.db.Query(
		"SELECT id, name, person, profile_id, times FROM medications ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	meds := []Medication{}
	for rows.Next() {
		var m Medication
		var times string
		var profile sql.NullInt64
		if err := rows.Scan(&m.ID, &m.Name, &m.Person, &profile, &times); err != nil {
			return nil, err
		}
		m.ProfileID = profile.Int64
		if err := json.Unmarshal([]byte(times), &m.Times); err != nil {
			return nil, fmt.Errorf("medication %d has corrupt times: %w", m.ID, err)
		}
		meds = append(meds, m)
	}
	return meds, rows.Err()
}

func (s *Store) CreateMedication(name, person string, profileID int64, times []string) (Medication, error) {
	b, err := json.Marshal(times)
	if err != nil {
		return Medication{}, err
	}
	var profile any
	if profileID != 0 {
		profile = profileID
	}
	res, err := s.db.Exec(
		"INSERT INTO medications (name, person, profile_id, times) VALUES (?, ?, ?, ?)",
		name, person, profile, string(b),
	)
	if err != nil {
		return Medication{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Medication{}, err
	}
	return Medication{ID: id, Name: name, Person: person, ProfileID: profileID, Times: times}, nil
}

func (s *Store) DeleteMedication(id int64) error {
	res, err := s.db.Exec("DELETE FROM medications WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// TakenDosesBetween returns doses logged in [start, end] (inclusive days).
// Daily slots look at a single day; weekly slots at the current week.
func (s *Store) TakenDosesBetween(start, end string) ([]DoseKey, error) {
	rows, err := s.db.Query(
		"SELECT medication_id, slot FROM medication_logs WHERE day >= ? AND day <= ?",
		start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	doses := []DoseKey{}
	for rows.Next() {
		var d DoseKey
		if err := rows.Scan(&d.MedicationID, &d.Slot); err != nil {
			return nil, err
		}
		doses = append(doses, d)
	}
	return doses, rows.Err()
}

// ToggleDose marks a dose taken (logged on `day`), or un-marks it if already
// logged anywhere in [windowStart, windowEnd] — the reset window: one day
// for daily slots, the current week for weekly ones. Returns true if the
// dose is now marked taken.
func (s *Store) ToggleDose(medicationID int64, slot, day, windowStart, windowEnd string) (bool, error) {
	res, err := s.db.Exec(
		"DELETE FROM medication_logs WHERE medication_id = ? AND slot = ? AND day >= ? AND day <= ?",
		medicationID, slot, windowStart, windowEnd,
	)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return false, nil // was taken, now cleared
	}
	_, err = s.db.Exec(
		"INSERT INTO medication_logs (medication_id, day, slot) VALUES (?, ?, ?)",
		medicationID, day, slot,
	)
	return true, err
}
