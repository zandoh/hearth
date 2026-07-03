package store

import (
	"errors"
	"testing"
)

func TestGuestbookCRUD(t *testing.T) {
	s := openTestStore(t)
	n, err := s.AddGuestbookNote("Grandma", "Loved the visit", "pink")
	if err != nil {
		t.Fatal(err)
	}
	notes, _ := s.ListGuestbookNotes()
	if len(notes) != 1 || notes[0].Author != "Grandma" || notes[0].Color != "pink" {
		t.Errorf("notes = %+v", notes)
	}
	if err := s.DeleteGuestbookNote(n.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteGuestbookNote(n.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("double delete: %v", err)
	}
}

func TestMealEntriesUpsertAndClear(t *testing.T) {
	s := openTestStore(t)
	if err := s.SetMealEntry("2026-07-06", "dinner", "Tacos"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetMealEntry("2026-07-06", "dinner", "Pizza night"); err != nil {
		t.Fatal(err)
	}
	entries, _ := s.MealEntriesBetween("2026-07-05", "2026-07-11")
	if len(entries) != 1 || entries[0].Text != "Pizza night" {
		t.Errorf("entries = %+v, want single upserted dinner", entries)
	}
	if err := s.SetMealEntry("2026-07-06", "dinner", ""); err != nil {
		t.Fatal(err)
	}
	entries, _ = s.MealEntriesBetween("2026-07-05", "2026-07-11")
	if len(entries) != 0 {
		t.Errorf("empty text should clear the entry: %+v", entries)
	}
}
