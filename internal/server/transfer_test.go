package server

// Export/import round-trip through the real HTTP surface: what leaves one
// instance must land intact on another, minus the fields that don't travel.

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/store"
)

func TestExportImportRoundTrip(t *testing.T) {
	source := newTestServer(t)
	layout := []map[string]any{
		{"i": "wifi-1", "widget": "wifi", "x": 0, "y": 0, "w": 3, "h": 4,
			"config": map[string]any{"ssid": "HearthGuest", "auth": "WPA", "password": "pw"}},
	}
	// The migration seed provides view 1 ("Home"); shape it and add a second.
	if res, body := call(t, source, "PUT", "/api/views/1",
		map[string]any{"name": "Home", "layout": layout}); res.StatusCode != http.StatusOK {
		t.Fatalf("seed home: %d %s", res.StatusCode, body)
	}
	if res, body := call(t, source, "POST", "/api/views",
		map[string]any{"name": "Kitchen", "layout": []any{}}); res.StatusCode != http.StatusCreated {
		t.Fatalf("seed kitchen: %d %s", res.StatusCode, body)
	}

	res, body := call(t, source, "GET", "/api/views/export", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("export: %d %s", res.StatusCode, body)
	}
	if cd := res.Header.Get("Content-Disposition"); !strings.Contains(cd, "hearth-views-") {
		t.Errorf("Content-Disposition = %q, want an attachment filename", cd)
	}
	var doc transferDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.HearthViews != exportVersion || len(doc.Views) != 2 {
		t.Fatalf("doc = version %d with %d views", doc.HearthViews, len(doc.Views))
	}

	// Import into a fresh instance (its own seeded "Home" forces a dedupe).
	target := newTestServer(t)
	res, body = call(t, target, "POST", "/api/views/import", doc)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("import: %d %s", res.StatusCode, body)
	}
	var imported struct {
		Imported []store.View `json:"imported"`
	}
	if err := json.Unmarshal(body, &imported); err != nil {
		t.Fatal(err)
	}
	if len(imported.Imported) != 2 {
		t.Fatalf("imported %d views, want 2", len(imported.Imported))
	}
	if imported.Imported[0].Name != "Home 2" {
		t.Errorf("name = %q, want colliding name deduped to \"Home 2\"", imported.Imported[0].Name)
	}
	if imported.Imported[0].IsDefault {
		t.Error("imported view must not steal default status")
	}
	got := imported.Imported[0].Layout
	if len(got) != 1 || got[0].Widget != "wifi" || !strings.Contains(string(got[0].Config), "HearthGuest") {
		t.Errorf("layout did not survive the round trip: %+v", got)
	}
	if imported.Imported[1].Name != "Kitchen" {
		t.Errorf("non-colliding name = %q, want kept verbatim", imported.Imported[1].Name)
	}
}

func TestImportRejectsBadDocuments(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		name string
		doc  map[string]any
	}{
		{"wrong version", map[string]any{"hearthViews": 99, "views": []any{map[string]any{"name": "X"}}}},
		{"no views", map[string]any{"hearthViews": 1, "views": []any{}}},
		{"nameless view", map[string]any{"hearthViews": 1, "views": []any{map[string]any{"name": "  "}}}},
		{"malformed schedule", map[string]any{"hearthViews": 1,
			"views": []any{map[string]any{"name": "X", "scheduleStart": "7am", "scheduleEnd": "09:00"}}}},
	}
	for _, tc := range cases {
		if res, body := call(t, srv, "POST", "/api/views/import", tc.doc); res.StatusCode != http.StatusBadRequest {
			t.Errorf("%s: %d %s, want 400", tc.name, res.StatusCode, body)
		}
	}
	// Nothing partial may have landed.
	res, body := call(t, srv, "GET", "/api/views", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list: %d", res.StatusCode)
	}
	var views []store.View
	if err := json.Unmarshal(body, &views); err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 {
		t.Errorf("views = %d, want only the migration seed after rejected imports", len(views))
	}
}

func TestDedupeName(t *testing.T) {
	taken := map[string]bool{"Home": true, "Home 2": true}
	if got := dedupeName("Home", taken); got != "Home 3" {
		t.Errorf("dedupeName = %q, want Home 3", got)
	}
	if got := dedupeName("Kitchen", taken); got != "Kitchen" {
		t.Errorf("dedupeName = %q, want untouched", got)
	}
}
