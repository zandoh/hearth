package store

// The settings table is Hearth's tiny KV store: one row per key, shared by
// widgets and platform code alike. Raw string access (GetSetting et al.)
// exists for values whose on-disk representation predates Setting — the
// guest PIN hash, the guest view id, the weather units string — and must
// not change shape under existing databases. Everything else goes through
// the typed Setting.

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// GetSetting returns the raw stored value, or ErrNotFound if the key is unset.
func (s *Store) GetSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return value, err
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	return err
}

func (s *Store) DeleteSetting(key string) error {
	_, err := s.db.Exec("DELETE FROM settings WHERE key = ?", key)
	return err
}

// Setting is a typed settings entry: declare one per key
// (`var nightSetting = store.Setting[nightConfig]{Key: "night_dim"}`) and
// the codec has exactly one home — values are stored as JSON, and an unset
// key comes back as ok=false rather than an error, so callers never touch
// ErrNotFound or json themselves.
type Setting[T any] struct {
	Key string
}

// Get returns the stored value; ok is false when the key is unset.
func (s Setting[T]) Get(st *Store) (v T, ok bool, err error) {
	raw, err := st.GetSetting(s.Key)
	if errors.Is(err, ErrNotFound) {
		return v, false, nil
	}
	if err != nil {
		return v, false, err
	}
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return v, false, err
	}
	return v, true, nil
}

func (s Setting[T]) Set(st *Store, v T) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return st.SetSetting(s.Key, string(b))
}

func (s Setting[T]) Delete(st *Store) error {
	return st.DeleteSetting(s.Key)
}
