package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// Backups: VACUUM INTO writes a compact, consistent snapshot of the live
// database — safe under WAL while the server keeps serving.

const backupKeep = 7

// BackupTo snapshots the database to path. Fails if path already exists,
// which the callers use: one backup per day, unique temp names for
// downloads.
func (s *Store) BackupTo(path string) error {
	_, err := s.db.Exec("VACUUM INTO ?", path)
	return err
}

// MaintainBackups ensures today's snapshot exists under <db dir>/backups
// and prunes to the newest backupKeep files. Returns the path it created,
// or "" when today's already existed.
func (s *Store) MaintainBackups(dbPath string, now time.Time) (string, error) {
	dir := filepath.Join(filepath.Dir(dbPath), "backups")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("hearth-%s.db", now.Format("2006-01-02"))
	path := filepath.Join(dir, name)
	created := ""
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := s.BackupTo(path); err != nil {
			return "", err
		}
		created = path
	}
	return created, pruneBackups(dir)
}

// pruneBackups deletes the oldest date-named snapshots beyond backupKeep.
// Filenames sort chronologically, so no timestamp parsing is needed.
func pruneBackups(dir string) error {
	entries, err := filepath.Glob(filepath.Join(dir, "hearth-*.db"))
	if err != nil {
		return err
	}
	sort.Strings(entries)
	for len(entries) > backupKeep {
		if err := os.Remove(entries[0]); err != nil {
			return err
		}
		entries = entries[1:]
	}
	return nil
}
