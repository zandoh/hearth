package store

import (
	"errors"
	"testing"
)

func TestOneOffChoreCompletionDeletes(t *testing.T) {
	s := openTestStore(t)
	todo, err := s.CreateChore("Call mom", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CompleteChore(todo.ID, "2026-07-02"); err != nil {
		t.Fatalf("CompleteChore one-off: %v", err)
	}
	chores, _ := s.ListChores()
	for _, c := range chores {
		if c.ID == todo.ID {
			t.Error("one-off chore should be deleted after completion")
		}
	}
	if err := s.CompleteChore(9999, "2026-07-02"); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing chore: err = %v, want ErrNotFound", err)
	}
}
