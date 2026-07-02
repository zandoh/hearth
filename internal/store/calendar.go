package store

import (
	"database/sql"
	"errors"
	"fmt"
)

type Calendar struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Kind     string `json:"kind"` // "local" | "google"
	GoogleID string `json:"googleId,omitempty"`
	Enabled  bool   `json:"enabled"`
}

type Event struct {
	ID         int64  `json:"id"`
	CalendarID int64  `json:"calendarId"`
	ExternalID string `json:"-"`
	Title      string `json:"title"`
	StartsAt   string `json:"startsAt"` // RFC3339, or YYYY-MM-DD when AllDay
	EndsAt     string `json:"endsAt"`
	AllDay     bool   `json:"allDay"`
	Location   string `json:"location"`
	Notes      string `json:"notes"`
}

func (s *Store) GetSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return value, err
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	return err
}

func (s *Store) DeleteSetting(key string) error {
	_, err := s.db.Exec("DELETE FROM settings WHERE key = ?", key)
	return err
}

func scanCalendar(row interface{ Scan(...any) error }) (Calendar, error) {
	var c Calendar
	var googleID sql.NullString
	if err := row.Scan(&c.ID, &c.Name, &c.Color, &c.Kind, &googleID, &c.Enabled); err != nil {
		return Calendar{}, err
	}
	c.GoogleID = googleID.String
	return c, nil
}

const calendarCols = "id, name, color, kind, google_id, enabled"

func (s *Store) ListCalendars() ([]Calendar, error) {
	rows, err := s.db.Query("SELECT " + calendarCols + " FROM calendars ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cals := []Calendar{}
	for rows.Next() {
		c, err := scanCalendar(rows)
		if err != nil {
			return nil, err
		}
		cals = append(cals, c)
	}
	return cals, rows.Err()
}

func (s *Store) GetCalendar(id int64) (Calendar, error) {
	row := s.db.QueryRow("SELECT "+calendarCols+" FROM calendars WHERE id = ?", id)
	c, err := scanCalendar(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Calendar{}, ErrNotFound
	}
	return c, err
}

// CreateCalendar inserts a calendar. googleID must be "" for local calendars.
func (s *Store) CreateCalendar(name, color, kind, googleID string) (Calendar, error) {
	var gid any
	if googleID != "" {
		gid = googleID
	}
	res, err := s.db.Exec(
		"INSERT INTO calendars (name, color, kind, google_id) VALUES (?, ?, ?, ?)",
		name, color, kind, gid,
	)
	if err != nil {
		return Calendar{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Calendar{}, err
	}
	return s.GetCalendar(id)
}

func (s *Store) UpdateCalendar(id int64, name, color string, enabled bool) (Calendar, error) {
	res, err := s.db.Exec(
		"UPDATE calendars SET name = ?, color = ?, enabled = ? WHERE id = ?",
		name, color, enabled, id,
	)
	if err != nil {
		return Calendar{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Calendar{}, ErrNotFound
	}
	return s.GetCalendar(id)
}

func (s *Store) DeleteCalendar(id int64) error {
	res, err := s.db.Exec("DELETE FROM calendars WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

const eventCols = "id, calendar_id, external_id, title, starts_at, ends_at, all_day, location, notes"

func scanEvent(row interface{ Scan(...any) error }) (Event, error) {
	var e Event
	err := row.Scan(&e.ID, &e.CalendarID, &e.ExternalID, &e.Title,
		&e.StartsAt, &e.EndsAt, &e.AllDay, &e.Location, &e.Notes)
	return e, err
}

// EventsBetween returns events on enabled calendars overlapping [start, end).
// start/end are RFC3339. String comparison works because both stored formats
// (RFC3339 and YYYY-MM-DD) sort chronologically.
func (s *Store) EventsBetween(start, end string) ([]Event, error) {
	rows, err := s.db.Query(`
		SELECT `+eventCols+` FROM events
		WHERE starts_at < ? AND ends_at > ?
		  AND calendar_id IN (SELECT id FROM calendars WHERE enabled = 1)
		ORDER BY all_day DESC, starts_at`,
		end, start,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Event{}
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (s *Store) GetEvent(id int64) (Event, error) {
	row := s.db.QueryRow("SELECT "+eventCols+" FROM events WHERE id = ?", id)
	e, err := scanEvent(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Event{}, ErrNotFound
	}
	return e, err
}

func (s *Store) CreateEvent(e Event) (Event, error) {
	res, err := s.db.Exec(`
		INSERT INTO events (calendar_id, external_id, title, starts_at, ends_at, all_day, location, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.CalendarID, e.ExternalID, e.Title, e.StartsAt, e.EndsAt, e.AllDay, e.Location, e.Notes,
	)
	if err != nil {
		return Event{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Event{}, err
	}
	return s.GetEvent(id)
}

func (s *Store) UpdateEvent(e Event) (Event, error) {
	res, err := s.db.Exec(`
		UPDATE events SET title = ?, starts_at = ?, ends_at = ?, all_day = ?,
		       location = ?, notes = ?, updated_at = datetime('now')
		WHERE id = ?`,
		e.Title, e.StartsAt, e.EndsAt, e.AllDay, e.Location, e.Notes, e.ID,
	)
	if err != nil {
		return Event{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Event{}, ErrNotFound
	}
	return s.GetEvent(e.ID)
}

func (s *Store) DeleteEvent(id int64) error {
	res, err := s.db.Exec("DELETE FROM events WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ReplaceGoogleEvents atomically swaps a Google calendar's synced events for
// the freshly fetched set. Full-window replace keeps sync logic trivial; a
// household calendar has hundreds of events, not millions.
func (s *Store) ReplaceGoogleEvents(calendarID int64, events []Event) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM events WHERE calendar_id = ?", calendarID); err != nil {
		return err
	}
	stmt, err := tx.Prepare(`
		INSERT INTO events (calendar_id, external_id, title, starts_at, ends_at, all_day, location, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, e := range events {
		if _, err := stmt.Exec(calendarID, e.ExternalID, e.Title,
			e.StartsAt, e.EndsAt, e.AllDay, e.Location, e.Notes); err != nil {
			return fmt.Errorf("insert %q: %w", e.Title, err)
		}
	}
	return tx.Commit()
}
