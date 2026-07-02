package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestMigrationsSeedDefaultView(t *testing.T) {
	s := openTestStore(t)

	views, err := s.ListViews()
	if err != nil {
		t.Fatalf("ListViews: %v", err)
	}
	if len(views) != 1 {
		t.Fatalf("got %d views, want 1 seeded default", len(views))
	}
	if !views[0].IsDefault || views[0].Name != "Home" {
		t.Errorf("seed view = %+v, want default view named Home", views[0])
	}
	if len(views[0].Layout) != 1 || views[0].Layout[0].Widget != "clock" {
		t.Errorf("seed layout = %+v, want one clock widget", views[0].Layout)
	}
}

func TestViewCRUD(t *testing.T) {
	s := openTestStore(t)

	created, err := s.CreateView("Kitchen", []LayoutItem{
		{I: "clock-1", Widget: "clock", X: 0, Y: 0, W: 2, H: 2, Config: []byte(`{}`)},
	})
	if err != nil {
		t.Fatalf("CreateView: %v", err)
	}
	if created.Name != "Kitchen" || len(created.Layout) != 1 {
		t.Errorf("created = %+v", created)
	}

	updated, err := s.UpdateView(created.ID, "Kitchen 2", nil)
	if err != nil {
		t.Fatalf("UpdateView: %v", err)
	}
	if updated.Name != "Kitchen 2" || len(updated.Layout) != 0 {
		t.Errorf("updated = %+v", updated)
	}

	if err := s.DeleteView(created.ID); err != nil {
		t.Fatalf("DeleteView: %v", err)
	}
	if _, err := s.GetView(created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetView after delete: err = %v, want ErrNotFound", err)
	}
	if err := s.DeleteView(created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("double delete: err = %v, want ErrNotFound", err)
	}
}

func TestMigrationsAreIdempotent(t *testing.T) {
	s := openTestStore(t)
	if err := s.migrate(); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}
