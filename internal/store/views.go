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
	// Daily window (HH:MM local, may cross midnight) during which the kiosk
	// shows this view automatically; both empty = unscheduled.
	ScheduleStart string `json:"scheduleStart,omitempty"`
	ScheduleEnd   string `json:"scheduleEnd,omitempty"`
}

func scanView(row interface{ Scan(...any) error }) (View, error) {
	var v View
	var layout string
	var schedStart, schedEnd sql.NullString
	if err := row.Scan(&v.ID, &v.Name, &layout, &v.IsDefault, &schedStart, &schedEnd); err != nil {
		return View{}, err
	}
	v.ScheduleStart = schedStart.String
	v.ScheduleEnd = schedEnd.String
	if err := json.Unmarshal([]byte(layout), &v.Layout); err != nil {
		return View{}, fmt.Errorf("view %d has corrupt layout: %w", v.ID, err)
	}
	return v, nil
}

func (s *Store) ListViews() ([]View, error) {
	rows, err := s.db.Query(
		"SELECT id, name, layout, is_default, schedule_start, schedule_end FROM views ORDER BY sort_order, id")
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
	row := s.db.QueryRow("SELECT id, name, layout, is_default, schedule_start, schedule_end FROM views WHERE id = ?", id)
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
	res, err := s.db.Exec(
		"INSERT INTO views (name, layout, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM views))",
		name, string(b))
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

// ErrLastView guards the invariant that a household always has at least
// one view to render.
var ErrLastView = errors.New("cannot delete the last view")

func (s *Store) DeleteView(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var wasDefault bool
	if err := tx.QueryRow("SELECT is_default FROM views WHERE id = ?", id).
		Scan(&wasDefault); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var count int
	if err := tx.QueryRow("SELECT COUNT(*) FROM views").Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return ErrLastView
	}
	if _, err := tx.Exec("DELETE FROM views WHERE id = ?", id); err != nil {
		return err
	}
	// The board must always have a default to fall back to.
	if wasDefault {
		if _, err := tx.Exec(
			"UPDATE views SET is_default = 1 WHERE id = (SELECT MIN(id) FROM views)",
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SetDefaultView makes the given view the one the kiosk falls back to.
func (s *Store) SetDefaultView(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE views SET is_default = 1 WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec("UPDATE views SET is_default = 0 WHERE id != ?", id); err != nil {
		return err
	}
	return tx.Commit()
}

// SetViewSchedule claims (or with empty strings clears) a view's daily
// window. Validation of the HH:MM shape is the caller's job.
func (s *Store) SetViewSchedule(id int64, start, end string) error {
	var st, en any
	if start != "" && end != "" {
		st, en = start, end
	}
	res, err := s.db.Exec("UPDATE views SET schedule_start = ?, schedule_end = ? WHERE id = ?", st, en, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReorderViews rewrites the switcher order to match ids; views not listed
// keep their relative place after the listed ones.
func (s *Store) ReorderViews(ids []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.Exec("UPDATE views SET sort_order = ? WHERE id = ?", i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
