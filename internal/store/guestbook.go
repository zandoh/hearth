package store

type GuestbookNote struct {
	ID        int64  `json:"id"`
	Author    string `json:"author"`
	Message   string `json:"message"`
	Color     string `json:"color"`
	CreatedAt string `json:"createdAt"`
}

func (s *Store) ListGuestbookNotes() ([]GuestbookNote, error) {
	rows, err := s.db.Query(
		"SELECT id, author, message, color, created_at FROM guestbook_notes ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	notes := []GuestbookNote{}
	for rows.Next() {
		var n GuestbookNote
		if err := rows.Scan(&n.ID, &n.Author, &n.Message, &n.Color, &n.CreatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, n)
	}
	return notes, rows.Err()
}

func (s *Store) AddGuestbookNote(author, message, color string) (GuestbookNote, error) {
	res, err := s.db.Exec(
		"INSERT INTO guestbook_notes (author, message, color) VALUES (?, ?, ?)",
		author, message, color)
	if err != nil {
		return GuestbookNote{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return GuestbookNote{}, err
	}
	row := s.db.QueryRow(
		"SELECT id, author, message, color, created_at FROM guestbook_notes WHERE id = ?", id)
	var n GuestbookNote
	err = row.Scan(&n.ID, &n.Author, &n.Message, &n.Color, &n.CreatedAt)
	return n, err
}

func (s *Store) DeleteGuestbookNote(id int64) error {
	res, err := s.db.Exec("DELETE FROM guestbook_notes WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
