package store

import (
	"errors"
	"testing"
)

func TestRawSettings(t *testing.T) {
	s := openTestStore(t)

	if _, err := s.GetSetting("missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unset key: err = %v, want ErrNotFound", err)
	}

	if err := s.SetSetting("pin", "abc123"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	if v, err := s.GetSetting("pin"); err != nil || v != "abc123" {
		t.Errorf("GetSetting = (%q, %v), want abc123", v, err)
	}

	// Set on an existing key overwrites.
	if err := s.SetSetting("pin", "def456"); err != nil {
		t.Fatalf("SetSetting overwrite: %v", err)
	}
	if v, _ := s.GetSetting("pin"); v != "def456" {
		t.Errorf("after overwrite = %q, want def456", v)
	}

	if err := s.DeleteSetting("pin"); err != nil {
		t.Fatalf("DeleteSetting: %v", err)
	}
	if _, err := s.GetSetting("pin"); !errors.Is(err, ErrNotFound) {
		t.Errorf("after delete: err = %v, want ErrNotFound", err)
	}
	// Deleting an absent key is not an error.
	if err := s.DeleteSetting("pin"); err != nil {
		t.Errorf("double delete: %v", err)
	}
}

func TestTypedSetting(t *testing.T) {
	s := openTestStore(t)

	type window struct {
		Start string  `json:"start"`
		Level float64 `json:"level"`
	}
	setting := Setting[window]{Key: "night_test"}

	if _, ok, err := setting.Get(s); err != nil || ok {
		t.Errorf("unset: got (ok=%v, err=%v), want (false, nil)", ok, err)
	}

	want := window{Start: "22:00", Level: 0.6}
	if err := setting.Set(s, want); err != nil {
		t.Fatalf("Set: %v", err)
	}
	got, ok, err := setting.Get(s)
	if err != nil || !ok || got != want {
		t.Errorf("roundtrip = (%+v, %v, %v), want (%+v, true, nil)", got, ok, err, want)
	}

	if err := setting.Delete(s); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, ok, _ := setting.Get(s); ok {
		t.Error("after delete: still set")
	}
}

// TestTypedSettingStoresJSON pins the on-disk contract: Setting values are
// JSON, so a typed string is quoted while a raw string is bare. Keys written
// raw before Setting existed (guest PIN, weather units) rely on the
// distinction.
func TestTypedSettingStoresJSON(t *testing.T) {
	s := openTestStore(t)

	typed := Setting[string]{Key: "typed_key"}
	if err := typed.Set(s, "imperial"); err != nil {
		t.Fatal(err)
	}
	if raw, _ := s.GetSetting("typed_key"); raw != `"imperial"` {
		t.Errorf("typed string stored as %q, want JSON-quoted", raw)
	}

	if err := s.SetSetting("raw_key", "imperial"); err != nil {
		t.Fatal(err)
	}
	if raw, _ := s.GetSetting("raw_key"); raw != "imperial" {
		t.Errorf("raw string stored as %q, want bare", raw)
	}
	// A raw (non-JSON) value read through Setting is an error, not a silent ok.
	mismatched := Setting[string]{Key: "raw_key"}
	if _, ok, err := mismatched.Get(s); err == nil || ok {
		t.Errorf("raw value through typed Get: (ok=%v, err=%v), want decode error", ok, err)
	}
}
