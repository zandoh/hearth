package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/zandoh/hearth/internal/store"
)

// writeHearthDB produces a real, migrated Hearth database file at path by
// opening a store.Store there (which runs migrations, creating views +
// schema_migrations) and closing it.
func writeHearthDB(t *testing.T, path string) {
	t.Helper()
	st, err := store.Open(path)
	if err != nil {
		t.Fatalf("seed db: %v", err)
	}
	st.Close()
}

func TestValidateBackup(t *testing.T) {
	dir := t.TempDir()

	valid := filepath.Join(dir, "valid.db")
	writeHearthDB(t, valid)

	notDB := filepath.Join(dir, "not.db")
	if err := os.WriteFile(notDB, []byte("not a db"), 0o644); err != nil {
		t.Fatal(err)
	}

	missing := filepath.Join(dir, "does-not-exist.db")

	tests := []struct {
		name    string
		path    string
		wantErr bool
	}{
		{"valid Hearth DB", valid, false},
		{"non-SQLite file", notDB, true},
		{"missing file", missing, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateBackup(tt.path)
			if tt.wantErr && err == nil {
				t.Fatalf("validateBackup(%q) = nil, want error", tt.path)
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("validateBackup(%q) = %v, want nil", tt.path, err)
			}
		})
	}
}

func TestDoRestore(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "hearth.db")

	// Seed a current DB plus recognizable sidecars.
	writeHearthDB(t, dbPath)
	if err := os.WriteFile(dbPath+"-wal", []byte("wal"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dbPath+"-shm", []byte("shm"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Build a backup with a distinguishing marker profile.
	backupPath := filepath.Join(dir, "backup.db")
	writeHearthDB(t, backupPath)
	{
		st, err := store.Open(backupPath)
		if err != nil {
			t.Fatalf("open backup: %v", err)
		}
		if _, err := st.CreateProfile("RestoreMarker", "#4F6DF5"); err != nil {
			st.Close()
			t.Fatalf("mark backup: %v", err)
		}
		st.Close()
	}

	if err := doRestore(backupPath, dbPath); err != nil {
		t.Fatalf("doRestore = %v, want nil", err)
	}

	// The current DB was set aside exactly once.
	aside, err := filepath.Glob(dbPath + ".pre-restore-*")
	if err != nil {
		t.Fatal(err)
	}
	if len(aside) != 1 {
		t.Fatalf("pre-restore DB files = %v, want exactly one", aside)
	}

	// Both sidecars were moved aside (naming per restore.go: side +
	// ".pre-restore-<stamp>", where side = dbPath+"-wal" / "-shm").
	for _, suffix := range []string{"-wal", "-shm"} {
		if _, err := os.Stat(dbPath + suffix); !os.IsNotExist(err) {
			t.Fatalf("%s still exists after restore (err=%v)", dbPath+suffix, err)
		}
		moved, err := filepath.Glob(dbPath + suffix + ".pre-restore-*")
		if err != nil {
			t.Fatal(err)
		}
		if len(moved) != 1 {
			t.Fatalf("%s aside files = %v, want exactly one", suffix, moved)
		}
	}

	// The restored DB is the backup: the marker profile is present.
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open restored db: %v", err)
	}
	defer st.Close()
	profiles, err := st.ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range profiles {
		if p.Name == "RestoreMarker" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("restored DB missing RestoreMarker profile; got %+v", profiles)
	}
}

func TestDoRestoreRejectsInvalidBackup(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "hearth.db")
	writeHearthDB(t, dbPath)

	bogus := filepath.Join(dir, "bogus.txt")
	if err := os.WriteFile(bogus, []byte("not a db"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := doRestore(bogus, dbPath); err == nil {
		t.Fatal("doRestore with bogus backup = nil, want error")
	}

	// Validation happens before any rename: no set-aside file was created.
	aside, err := filepath.Glob(dbPath + ".pre-restore-*")
	if err != nil {
		t.Fatal(err)
	}
	if len(aside) != 0 {
		t.Fatalf("pre-restore files after rejected restore = %v, want none", aside)
	}

	// The current DB is untouched — it still opens.
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("current db no longer opens after rejected restore: %v", err)
	}
	st.Close()
}
