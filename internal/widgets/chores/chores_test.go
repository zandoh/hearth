package chores

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
)

func TestDueView(t *testing.T) {
	midnight := time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)
	tests := []struct {
		name  string
		chore store.Chore
		now   time.Time
		want  choreView
	}{
		{
			name:  "never done is due today",
			chore: store.Chore{Title: "Vacuum", EveryDays: 7},
			now:   midnight,
			want:  choreView{DueOn: "2026-07-02", DueIn: 0, NeverDone: true},
		},
		{
			name:  "done yesterday every day is due today",
			chore: store.Chore{EveryDays: 1, LastDone: "2026-07-01"},
			now:   midnight,
			want:  choreView{DueOn: "2026-07-02", DueIn: 0},
		},
		{
			name:  "overdue counts negative days",
			chore: store.Chore{EveryDays: 3, LastDone: "2026-06-25"},
			now:   midnight,
			want:  choreView{DueOn: "2026-06-28", DueIn: -4},
		},
		{
			name:  "upcoming counts days until due",
			chore: store.Chore{EveryDays: 7, LastDone: "2026-07-01"},
			now:   midnight,
			want:  choreView{DueOn: "2026-07-08", DueIn: 6},
		},
		{
			// dueIn truncates toward zero from a mid-day now, so a chore due
			// in 2 calendar days reads as 1 — pinned here so a deliberate fix
			// shows up as a test change, not a silent drift.
			name:  "mid-day now truncates the day count",
			chore: store.Chore{EveryDays: 3, LastDone: "2026-07-01"},
			now:   time.Date(2026, 7, 2, 15, 0, 0, 0, time.UTC),
			want:  choreView{DueOn: "2026-07-04", DueIn: 1},
		},
		{
			name:  "corrupt lastDone falls back to now",
			chore: store.Chore{EveryDays: 2, LastDone: "garbage"},
			now:   midnight,
			want:  choreView{DueOn: "2026-07-04", DueIn: 2},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := dueView(tt.chore, tt.now)
			if got.DueOn != tt.want.DueOn || got.DueIn != tt.want.DueIn ||
				got.NeverDone != tt.want.NeverDone {
				t.Errorf("dueView() = {DueOn:%s DueIn:%d NeverDone:%v}, want {DueOn:%s DueIn:%d NeverDone:%v}",
					got.DueOn, got.DueIn, got.NeverDone,
					tt.want.DueOn, tt.want.DueIn, tt.want.NeverDone)
			}
		})
	}
}

// --- handler tests: real SQLite store, requests through the widget's routes ---

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

func TestChoreLifecycle(t *testing.T) {
	mux := newTestMux(t)

	rec := doJSON(t, mux, "POST", "/api/widgets/chores", `{"title":"Vacuum","everyDays":7}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var chore store.Chore
	if err := json.Unmarshal(rec.Body.Bytes(), &chore); err != nil {
		t.Fatal(err)
	}

	// The store seeds sample chores, so find ours by id.
	v := findChore(t, mux, chore.ID)
	if !v.NeverDone || v.DueIn != 0 {
		t.Fatalf("fresh chore should be due today: %+v", v)
	}

	rec = doJSON(t, mux, "POST", "/api/widgets/chores/"+itoa(chore.ID)+"/complete", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("complete: %d %s", rec.Code, rec.Body)
	}
	v = findChore(t, mux, chore.ID)
	if v.NeverDone || v.LastDone == "" {
		t.Fatalf("completed chore should carry lastDone: %+v", v)
	}

	rec = doJSON(t, mux, "DELETE", "/api/widgets/chores/"+itoa(chore.ID), "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rec.Code, rec.Body)
	}
}

func TestChoreValidationAndNotFound(t *testing.T) {
	mux := newTestMux(t)

	for name, body := range map[string]string{
		"missing title":  `{"everyDays":3}`,
		"zero everyDays": `{"title":"x","everyDays":0}`,
		"invalid JSON":   `{`,
	} {
		if rec := doJSON(t, mux, "POST", "/api/widgets/chores", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", name, rec.Code)
		}
	}

	if rec := doJSON(t, mux, "DELETE", "/api/widgets/chores/999", ""); rec.Code != http.StatusNotFound {
		t.Errorf("delete missing: got %d, want 404", rec.Code)
	}
	if rec := doJSON(t, mux, "POST", "/api/widgets/chores/999/complete", ""); rec.Code != http.StatusNotFound {
		t.Errorf("complete missing: got %d, want 404", rec.Code)
	}
	if rec := doJSON(t, mux, "DELETE", "/api/widgets/chores/abc", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad id: got %d, want 400", rec.Code)
	}
}

func findChore(t *testing.T, mux *http.ServeMux, id int64) choreView {
	t.Helper()
	rec := doJSON(t, mux, "GET", "/api/widgets/chores", "")
	var list []choreView
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	for _, v := range list {
		if v.ID == id {
			return v
		}
	}
	t.Fatalf("chore %d not in list", id)
	return choreView{}
}

func itoa(id int64) string {
	b, _ := json.Marshal(id)
	return string(b)
}
