package store

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMaintainBackupsSnapshotsAndPrunes(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if _, err := s.CreateProfile("Riley", "#4F6DF5"); err != nil {
		t.Fatal(err)
	}

	now := time.Date(2026, 7, 3, 3, 0, 0, 0, time.UTC)
	created, err := s.MaintainBackups(dbPath, now)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(created) != "hearth-2026-07-03.db" {
		t.Fatalf("created = %q", created)
	}

	// Same day again: no new file.
	again, err := s.MaintainBackups(dbPath, now)
	if err != nil {
		t.Fatal(err)
	}
	if again != "" {
		t.Fatalf("second run created %q, want none", again)
	}

	// The snapshot is a real database with the data in it.
	restored, err := Open(created)
	if err != nil {
		t.Fatalf("snapshot does not open: %v", err)
	}
	defer restored.Close()
	profiles, err := restored.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].Name != "Riley" {
		t.Fatalf("snapshot content = %+v", profiles)
	}

	// Ten dated files: prune keeps the newest seven.
	backups := filepath.Join(dir, "backups")
	for day := 10; day <= 19; day++ {
		f := filepath.Join(backups, time.Date(2026, 6, day, 0, 0, 0, 0, time.UTC).Format("hearth-2006-01-02.db"))
		if err := os.WriteFile(f, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.MaintainBackups(dbPath, now); err != nil {
		t.Fatal(err)
	}
	left, _ := filepath.Glob(filepath.Join(backups, "hearth-*.db"))
	if len(left) != backupKeep {
		t.Fatalf("kept %d backups, want %d: %v", len(left), backupKeep, left)
	}
	// The newest (today's real snapshot) must survive pruning.
	if _, err := os.Stat(created); err != nil {
		t.Fatalf("today's snapshot was pruned: %v", err)
	}
}
