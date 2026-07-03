package store

import (
	"errors"
	"testing"
)

func TestProfileLifecycleAndUnassignment(t *testing.T) {
	s := openTestStore(t)

	p, err := s.CreateProfile("Riley", "#4F6DF5")
	if err != nil {
		t.Fatal(err)
	}

	chore, err := s.CreateChore("Vacuum", 7, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if chore.AssigneeID != p.ID {
		t.Fatalf("assignee = %d, want %d", chore.AssigneeID, p.ID)
	}

	med, err := s.CreateMedication("Allergy", "", p.ID, []string{"AM"})
	if err != nil {
		t.Fatal(err)
	}
	if med.ProfileID != p.ID {
		t.Fatalf("med profile = %d, want %d", med.ProfileID, p.ID)
	}

	if err := s.UpdateProfile(Profile{ID: p.ID, Name: "Riley P", Color: "#22AA66"}); err != nil {
		t.Fatal(err)
	}
	profiles, err := s.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].Name != "Riley P" || profiles[0].Color != "#22AA66" {
		t.Fatalf("unexpected profiles after update: %+v", profiles)
	}

	// Deleting the person unassigns their chores and meds, never deletes
	// them. Force the delete onto a fresh pool connection first: pragmas
	// used to be set per-connection, so FK actions (SET NULL here, CASCADE
	// elsewhere) silently skipped on every connection but the first.
	s.db.SetMaxIdleConns(0)
	if err := s.DeleteProfile(p.ID); err != nil {
		t.Fatal(err)
	}
	s.db.SetMaxIdleConns(2)
	chores, err := s.ListChores()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range chores {
		if c.ID == chore.ID {
			found = true
			if c.AssigneeID != 0 {
				t.Fatalf("chore should survive unassigned, got %+v", c)
			}
		}
	}
	if !found {
		t.Fatal("chore was deleted along with its profile")
	}
	meds, err := s.ListMedications()
	if err != nil {
		t.Fatal(err)
	}
	found = false
	for _, m := range meds {
		if m.ID == med.ID {
			found = true
			if m.ProfileID != 0 {
				t.Fatalf("med should survive unassigned, got %+v", m)
			}
		}
	}
	if !found {
		t.Fatal("med was deleted along with its profile")
	}

	if err := s.DeleteProfile(p.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete = %v, want ErrNotFound", err)
	}
}
