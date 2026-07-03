package store

type Profile struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (s *Store) ListProfiles() ([]Profile, error) {
	rows, err := s.db.Query("SELECT id, name, color FROM profiles ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	profiles := []Profile{}
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Color); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func (s *Store) CreateProfile(name, color string) (Profile, error) {
	res, err := s.db.Exec("INSERT INTO profiles (name, color) VALUES (?, ?)", name, color)
	if err != nil {
		return Profile{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Profile{}, err
	}
	return Profile{ID: id, Name: name, Color: color}, nil
}

func (s *Store) UpdateProfile(p Profile) error {
	res, err := s.db.Exec("UPDATE profiles SET name = ?, color = ? WHERE id = ?",
		p.Name, p.Color, p.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteProfile removes the person; their chores and meds stay, unassigned
// (the FKs are ON DELETE SET NULL).
func (s *Store) DeleteProfile(id int64) error {
	res, err := s.db.Exec("DELETE FROM profiles WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
