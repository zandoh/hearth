package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

// LayoutItem is one widget placement in a view's grid.
type LayoutItem struct {
	I      string          `json:"i"`      // unique instance id within the view
	Widget string          `json:"widget"` // widget slug, e.g. "clock"
	X      int             `json:"x"`
	Y      int             `json:"y"`
	W      int             `json:"w"`
	H      int             `json:"h"`
	Config json.RawMessage `json:"config"`
}

type View struct {
	ID        int64        `json:"id"`
	Name      string       `json:"name"`
	Layout    []LayoutItem `json:"layout"`
	IsDefault bool         `json:"isDefault"`
}

func scanView(row interface{ Scan(...any) error }) (View, error) {
	var v View
	var layout string
	if err := row.Scan(&v.ID, &v.Name, &layout, &v.IsDefault); err != nil {
		return View{}, err
	}
	if err := json.Unmarshal([]byte(layout), &v.Layout); err != nil {
		return View{}, fmt.Errorf("view %d has corrupt layout: %w", v.ID, err)
	}
	return v, nil
}

func (s *Store) ListViews() ([]View, error) {
	rows, err := s.db.Query("SELECT id, name, layout, is_default FROM views ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	views := []View{}
	for rows.Next() {
		v, err := scanView(rows)
		if err != nil {
			return nil, err
		}
		views = append(views, v)
	}
	return views, rows.Err()
}

func (s *Store) GetView(id int64) (View, error) {
	row := s.db.QueryRow("SELECT id, name, layout, is_default FROM views WHERE id = ?", id)
	v, err := scanView(row)
	if errors.Is(err, sql.ErrNoRows) {
		return View{}, ErrNotFound
	}
	return v, err
}

func (s *Store) CreateView(name string, layout []LayoutItem) (View, error) {
	b, err := json.Marshal(layout)
	if err != nil {
		return View{}, err
	}
	res, err := s.db.Exec("INSERT INTO views (name, layout) VALUES (?, ?)", name, string(b))
	if err != nil {
		return View{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return View{}, err
	}
	return s.GetView(id)
}

func (s *Store) UpdateView(id int64, name string, layout []LayoutItem) (View, error) {
	b, err := json.Marshal(layout)
	if err != nil {
		return View{}, err
	}
	res, err := s.db.Exec(
		"UPDATE views SET name = ?, layout = ?, updated_at = datetime('now') WHERE id = ?",
		name, string(b), id,
	)
	if err != nil {
		return View{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return View{}, ErrNotFound
	}
	return s.GetView(id)
}

func (s *Store) DeleteView(id int64) error {
	res, err := s.db.Exec("DELETE FROM views WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

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
