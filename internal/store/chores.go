package store

import (
	"database/sql"
	"errors"
)

type Chore struct {
	ID         int64  `json:"id"`
	Title      string `json:"title"`
	EveryDays  int    `json:"everyDays"`
	LastDone   string `json:"lastDone,omitempty"` // YYYY-MM-DD, "" if never
	AssigneeID int64  `json:"assigneeId,omitempty"`
}

const choreCols = "id, title, every_days, last_done, assignee_id"

func scanChore(row interface{ Scan(...any) error }) (Chore, error) {
	var c Chore
	var lastDone sql.NullString
	var assignee sql.NullInt64
	if err := row.Scan(&c.ID, &c.Title, &c.EveryDays, &lastDone, &assignee); err != nil {
		return Chore{}, err
	}
	c.LastDone = lastDone.String
	c.AssigneeID = assignee.Int64
	return c, nil
}

func (s *Store) ListChores() ([]Chore, error) {
	rows, err := s.db.Query(
		"SELECT " + choreCols + " FROM chores ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	chores := []Chore{}
	for rows.Next() {
		c, err := scanChore(rows)
		if err != nil {
			return nil, err
		}
		chores = append(chores, c)
	}
	return chores, rows.Err()
}

func (s *Store) CreateChore(title string, everyDays int, assigneeID int64) (Chore, error) {
	// 0 means unassigned, stored as NULL so profile-deletion semantics hold.
	var assignee any
	if assigneeID != 0 {
		assignee = assigneeID
	}
	res, err := s.db.Exec(
		"INSERT INTO chores (title, every_days, assignee_id) VALUES (?, ?, ?)",
		title, everyDays, assignee)
	if err != nil {
		return Chore{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Chore{}, err
	}
	row := s.db.QueryRow(
		"SELECT "+choreCols+" FROM chores WHERE id = ?", id)
	return scanChore(row)
}

func (s *Store) DeleteChore(id int64) error {
	res, err := s.db.Exec("DELETE FROM chores WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// CompleteChore marks the chore done on the given day and logs it. One-off
// chores (every_days = 0) are jobs, not routines: completing one deletes it.
func (s *Store) CompleteChore(id int64, day string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var everyDays int
	if err := tx.QueryRow("SELECT every_days FROM chores WHERE id = ?", id).
		Scan(&everyDays); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if everyDays == 0 {
		if _, err := tx.Exec("DELETE FROM chores WHERE id = ?", id); err != nil {
			return err
		}
		return tx.Commit()
	}
	if _, err := tx.Exec("UPDATE chores SET last_done = ? WHERE id = ?", day, id); err != nil {
		return err
	}
	if _, err := tx.Exec(
		"INSERT INTO chore_completions (chore_id, done_on) VALUES (?, ?)", id, day,
	); err != nil {
		return err
	}
	return tx.Commit()
}
