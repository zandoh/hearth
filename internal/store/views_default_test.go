package store

import (
	"errors"
	"testing"
)

func TestSetDefaultViewMovesTheFlag(t *testing.T) {
	s := openTestStore(t)
	second, err := s.CreateView("Kitchen", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetDefaultView(second.ID); err != nil {
		t.Fatalf("SetDefaultView: %v", err)
	}
	views, _ := s.ListViews()
	for _, v := range views {
		if v.IsDefault != (v.ID == second.ID) {
			t.Errorf("view %q default=%v, want default only on Kitchen", v.Name, v.IsDefault)
		}
	}
	if err := s.SetDefaultView(9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing view: err = %v, want ErrNotFound", err)
	}
}

func TestDeleteViewGuards(t *testing.T) {
	s := openTestStore(t)
	// Only the seeded Home view exists: deleting it must be refused.
	views, _ := s.ListViews()
	if err := s.DeleteView(views[0].ID); !errors.Is(err, ErrLastView) {
		t.Fatalf("deleting last view: err = %v, want ErrLastView", err)
	}
	// Add a second view, delete the DEFAULT one: the survivor is promoted.
	second, _ := s.CreateView("Kitchen", nil)
	if err := s.DeleteView(views[0].ID); err != nil {
		t.Fatalf("delete default: %v", err)
	}
	remaining, _ := s.ListViews()
	if len(remaining) != 1 || remaining[0].ID != second.ID || !remaining[0].IsDefault {
		t.Errorf("after deleting default: %+v, want Kitchen promoted to default", remaining)
	}
}
