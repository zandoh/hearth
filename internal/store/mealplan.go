package store

type MealEntry struct {
	Day  string `json:"day"`  // YYYY-MM-DD
	Slot string `json:"slot"` // breakfast | lunch | dinner
	Text string `json:"text"`
}

// MealEntriesBetween returns entries for [start, end] inclusive.
func (s *Store) MealEntriesBetween(start, end string) ([]MealEntry, error) {
	rows, err := s.db.Query(
		"SELECT day, slot, text FROM meal_entries WHERE day >= ? AND day <= ? ORDER BY day, slot",
		start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []MealEntry{}
	for rows.Next() {
		var e MealEntry
		if err := rows.Scan(&e.Day, &e.Slot, &e.Text); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// SetMealEntry upserts a day/slot entry; empty text deletes it.
func (s *Store) SetMealEntry(day, slot, text string) error {
	if text == "" {
		_, err := s.db.Exec("DELETE FROM meal_entries WHERE day = ? AND slot = ?", day, slot)
		return err
	}
	_, err := s.db.Exec(`
		INSERT INTO meal_entries (day, slot, text) VALUES (?, ?, ?)
		ON CONFLICT(day, slot) DO UPDATE SET text = excluded.text`,
		day, slot, text)
	return err
}
