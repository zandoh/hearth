package guestbook

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
)

func newTestMux(t *testing.T) *http.ServeMux {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	mux := http.NewServeMux()
	New(st, sse.NewHub()).Routes(mux)
	return mux
}

func doJSON(t *testing.T, mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// addBody builds a POST body with a message (and optional color) safely, so
// long or emoji-heavy messages get correct JSON quoting.
func addBody(t *testing.T, fields map[string]string) string {
	t.Helper()
	b, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestGuestbookMessageValidation(t *testing.T) {
	mux := newTestMux(t)

	// Blank / whitespace-only message is rejected.
	if rec := doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": "   "})); rec.Code != http.StatusBadRequest {
		t.Errorf("blank message: got %d, want 400", rec.Code)
	}

	// 281 ASCII characters is one over the 280-rune limit.
	if rec := doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": strings.Repeat("a", 281)})); rec.Code != http.StatusBadRequest {
		t.Errorf("281-char message: got %d, want 400", rec.Code)
	}

	// 280 emoji = 280 runes but >1000 bytes: proves the limit counts runes,
	// not bytes, so an emoji-heavy note under the character count is accepted.
	if rec := doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": strings.Repeat("😀", 280)})); rec.Code != http.StatusCreated {
		t.Errorf("280-emoji message: got %d, want 201", rec.Code)
	}
}

func TestGuestbookColorCoercion(t *testing.T) {
	mux := newTestMux(t)

	// A color outside the allowlist falls back to yellow.
	rec := doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": "hi", "color": "chartreuse"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("add chartreuse: got %d, want 201: %s", rec.Code, rec.Body)
	}
	var note store.GuestbookNote
	if err := json.Unmarshal(rec.Body.Bytes(), &note); err != nil {
		t.Fatal(err)
	}
	if note.Color != "yellow" {
		t.Errorf("chartreuse should coerce to yellow, got %q", note.Color)
	}

	// An allowlisted color is preserved.
	rec = doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": "hi", "color": "blue"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("add blue: got %d, want 201: %s", rec.Code, rec.Body)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &note); err != nil {
		t.Fatal(err)
	}
	if note.Color != "blue" {
		t.Errorf("blue should be preserved, got %q", note.Color)
	}
}

func TestGuestbookPositionClampAndNotFound(t *testing.T) {
	mux := newTestMux(t)

	// Add a note and capture its id.
	rec := doJSON(t, mux, "POST", "/api/widgets/guestbook",
		addBody(t, map[string]string{"message": "hi"}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: got %d, want 201: %s", rec.Code, rec.Body)
	}
	var note store.GuestbookNote
	if err := json.Unmarshal(rec.Body.Bytes(), &note); err != nil {
		t.Fatal(err)
	}

	// Out-of-range coordinates are clamped to [0,1] server-side.
	rec = doJSON(t, mux, "PUT", fmt.Sprintf("/api/widgets/guestbook/%d/position", note.ID), `{"x":5,"y":-2}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("move: got %d, want 204: %s", rec.Code, rec.Body)
	}

	rec = doJSON(t, mux, "GET", "/api/widgets/guestbook", "")
	var notes []store.GuestbookNote
	if err := json.Unmarshal(rec.Body.Bytes(), &notes); err != nil {
		t.Fatal(err)
	}
	var found *store.GuestbookNote
	for i := range notes {
		if notes[i].ID == note.ID {
			found = &notes[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("note %d missing from list", note.ID)
	}
	if found.X != 1 || found.Y != 0 {
		t.Errorf("position not clamped: got x=%v y=%v, want x=1 y=0", found.X, found.Y)
	}

	// Moving an unknown id is a 404.
	if rec := doJSON(t, mux, "PUT", "/api/widgets/guestbook/999/position", `{"x":0.5,"y":0.5}`); rec.Code != http.StatusNotFound {
		t.Errorf("move missing: got %d, want 404", rec.Code)
	}

	// Deleting an unknown id is a 404.
	if rec := doJSON(t, mux, "DELETE", "/api/widgets/guestbook/999", ""); rec.Code != http.StatusNotFound {
		t.Errorf("delete missing: got %d, want 404", rec.Code)
	}

	// A non-numeric id is a 400.
	if rec := doJSON(t, mux, "DELETE", "/api/widgets/guestbook/abc", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("delete bad id: got %d, want 400", rec.Code)
	}
}
