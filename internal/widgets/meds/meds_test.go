package meds

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

func createMed(t *testing.T, mux *http.ServeMux) store.Medication {
	t.Helper()
	rec := doJSON(t, mux, "POST", "/api/widgets/meds",
		`{"name":"Lisinopril","person":"Grandma","times":["08:00","20:00"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var med store.Medication
	if err := json.Unmarshal(rec.Body.Bytes(), &med); err != nil {
		t.Fatal(err)
	}
	return med
}

// The mis-tap invariant: toggling the same dose twice lands back on
// not-taken, and the today view agrees after each toggle.
func TestToggleDoseIsItsOwnUndo(t *testing.T) {
	mux := newTestMux(t)
	med := createMed(t, mux)
	path := fmt.Sprintf("/api/widgets/meds/%d/toggle", med.ID)

	var res struct {
		Taken bool `json:"taken"`
	}
	rec := doJSON(t, mux, "POST", path, `{"slot":"08:00"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("toggle: %d %s", rec.Code, rec.Body)
	}
	json.Unmarshal(rec.Body.Bytes(), &res)
	if !res.Taken {
		t.Fatal("first toggle should mark taken")
	}
	if !doseTaken(t, mux, "08:00") {
		t.Fatal("today view should show 08:00 taken")
	}

	rec = doJSON(t, mux, "POST", path, `{"slot":"08:00"}`)
	json.Unmarshal(rec.Body.Bytes(), &res)
	if res.Taken {
		t.Fatal("second toggle should clear the dose")
	}
	if doseTaken(t, mux, "08:00") {
		t.Fatal("today view should show 08:00 cleared")
	}
	if doseTaken(t, mux, "20:00") {
		t.Fatal("the other slot was never touched")
	}
}

func doseTaken(t *testing.T, mux *http.ServeMux, slot string) bool {
	t.Helper()
	rec := doJSON(t, mux, "GET", "/api/widgets/meds/today", "")
	var today struct {
		Medications []struct {
			Doses []struct {
				Slot  string `json:"slot"`
				Taken bool   `json:"taken"`
			} `json:"doses"`
		} `json:"medications"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &today); err != nil {
		t.Fatal(err)
	}
	for _, m := range today.Medications {
		for _, d := range m.Doses {
			if d.Slot == slot {
				return d.Taken
			}
		}
	}
	t.Fatalf("slot %s not in today view", slot)
	return false
}

func TestMedValidation(t *testing.T) {
	mux := newTestMux(t)
	for name, body := range map[string]string{
		"missing name": `{"times":["08:00"]}`,
		"no times":     `{"name":"x","times":[]}`,
		"bad slot":     `{"name":"x","times":["8am"]}`,
		"invalid JSON": `{`,
	} {
		if rec := doJSON(t, mux, "POST", "/api/widgets/meds", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", name, rec.Code)
		}
	}

	med := createMed(t, mux)
	path := fmt.Sprintf("/api/widgets/meds/%d/toggle", med.ID)
	if rec := doJSON(t, mux, "POST", path, `{"slot":"25:99"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad toggle slot: got %d, want 400", rec.Code)
	}
	if rec := doJSON(t, mux, "DELETE", "/api/widgets/meds/999", ""); rec.Code != http.StatusNotFound {
		t.Errorf("delete missing: got %d, want 404", rec.Code)
	}
}
