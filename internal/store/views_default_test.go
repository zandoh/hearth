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

func TestReorderViews(t *testing.T) {
	s := openTestStore(t)
	b, _ := s.CreateView("B", nil)
	c, _ := s.CreateView("C", nil)

	views, err := s.ListViews()
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 3 || views[1].ID != b.ID || views[2].ID != c.ID {
		t.Fatalf("new views should append in order, got %+v", views)
	}

	// Home(1), B, C -> C, Home, B
	if err := s.ReorderViews([]int64{c.ID, views[0].ID, b.ID}); err != nil {
		t.Fatal(err)
	}
	views, err = s.ListViews()
	if err != nil {
		t.Fatal(err)
	}
	if views[0].ID != c.ID || views[2].ID != b.ID {
		t.Fatalf("reorder not applied: %+v", views)
	}
}
