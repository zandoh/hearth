package main

import (
	"database/sql"
	"fmt"
	"io"
	"os"
	"time"
)

// doRestore replaces the database with a backup file — the recovery half of
// the nightly snapshots. STOP THE SERVER FIRST: the swap is a file replace,
// and a live server would keep writing through its old handle.
//
// Nothing is destroyed: the current database is set aside as
// <db>.pre-restore-<stamp> before the backup is copied into place, and any
// stale -wal/-shm sidecars are moved with it so they can't replay old pages
// over the restored data.
func doRestore(backupPath, dbPath string) error {
	if err := validateBackup(backupPath); err != nil {
		return fmt.Errorf("%s does not look like a Hearth database: %w", backupPath, err)
	}

	stamp := time.Now().Format("20060102-150405")
	if _, err := os.Stat(dbPath); err == nil {
		aside := fmt.Sprintf("%s.pre-restore-%s", dbPath, stamp)
		if err := os.Rename(dbPath, aside); err != nil {
			return fmt.Errorf("set current database aside: %w", err)
		}
		fmt.Printf("current database kept at %s\n", aside)
	}
	// Sidecars belong to the old database; left behind they would corrupt
	// the restored one on first open.
	for _, suffix := range []string{"-wal", "-shm"} {
		side := dbPath + suffix
		if _, err := os.Stat(side); err == nil {
			if err := os.Rename(side, fmt.Sprintf("%s.pre-restore-%s", side, stamp)); err != nil {
				return fmt.Errorf("set %s aside: %w", side, err)
			}
		}
	}

	if err := copyFile(backupPath, dbPath); err != nil {
		return fmt.Errorf("copy backup into place: %w", err)
	}
	fmt.Printf("restored %s from %s\n", dbPath, backupPath)
	return nil
}

// validateBackup opens the file read-only and checks it carries Hearth's
// schema, without running migrations against (or otherwise mutating) it.
func validateBackup(path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('views', 'schema_migrations')",
	).Scan(&n); err != nil {
		return err
	}
	if n != 2 {
		return fmt.Errorf("missing core tables")
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
