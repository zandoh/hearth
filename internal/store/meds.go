package store

import (
	"encoding/json"
	"fmt"
)

type Medication struct {
	ID     int64    `json:"id"`
	Name   string   `json:"name"`
	Person string   `json:"person"`
	Times  []string `json:"times"` // "HH:MM" dose slots
}

// DoseKey identifies one dose checkbox: medication + slot, for a given day.
type DoseKey struct {
	MedicationID int64  `json:"medicationId"`
	Slot         string `json:"slot"`
}

func (s *Store) ListMedications() ([]Medication, error) {
	rows, err := s.db.Query("SELECT id, name, person, times FROM medications ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	meds := []Medication{}
	for rows.Next() {
		var m Medication
		var times string
		if err := rows.Scan(&m.ID, &m.Name, &m.Person, &times); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(times), &m.Times); err != nil {
			return nil, fmt.Errorf("medication %d has corrupt times: %w", m.ID, err)
		}
		meds = append(meds, m)
	}
	return meds, rows.Err()
}

func (s *Store) CreateMedication(name, person string, times []string) (Medication, error) {
	b, err := json.Marshal(times)
	if err != nil {
		return Medication{}, err
	}
	res, err := s.db.Exec(
		"INSERT INTO medications (name, person, times) VALUES (?, ?, ?)",
		name, person, string(b),
	)
	if err != nil {
		return Medication{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Medication{}, err
	}
	return Medication{ID: id, Name: name, Person: person, Times: times}, nil
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

// TakenDoses returns which doses have been logged for the given day.
func (s *Store) TakenDoses(day string) ([]DoseKey, error) {
	rows, err := s.db.Query(
		"SELECT medication_id, slot FROM medication_logs WHERE day = ?", day)
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

// ToggleDose marks a dose taken, or un-marks it if already logged (mis-taps
// happen). Returns true if the dose is now marked taken.
func (s *Store) ToggleDose(medicationID int64, day, slot string) (bool, error) {
	res, err := s.db.Exec(
		"DELETE FROM medication_logs WHERE medication_id = ? AND day = ? AND slot = ?",
		medicationID, day, slot,
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
