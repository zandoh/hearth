package mealplan

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

// weekResponse mirrors the {"start", "entries"} shape handleWeek returns.
type weekResponse struct {
	Start   string            `json:"start"`
	Entries []store.MealEntry `json:"entries"`
}

func getWeek(t *testing.T, mux *http.ServeMux, path string) weekResponse {
	t.Helper()
	rec := doJSON(t, mux, "GET", path, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s: %d %s", path, rec.Code, rec.Body)
	}
	var resp weekResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestMealplanEntryValidation(t *testing.T) {
	mux := newTestMux(t)

	// Day not matching YYYY-MM-DD (single-digit month/day) is rejected.
	if rec := doJSON(t, mux, "PUT", "/api/widgets/mealplan/entry", `{"day":"2026-7-1","slot":"dinner","text":"Tacos"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad day format: got %d, want 400 (%s)", rec.Code, rec.Body)
	}
	// Slot outside {breakfast, lunch, dinner} is rejected.
	if rec := doJSON(t, mux, "PUT", "/api/widgets/mealplan/entry", `{"day":"2026-07-01","slot":"brunch","text":"x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("bad slot: got %d, want 400 (%s)", rec.Code, rec.Body)
	}
	// Well-formed day and allowed slot is accepted.
	if rec := doJSON(t, mux, "PUT", "/api/widgets/mealplan/entry", `{"day":"2026-07-05","slot":"dinner","text":"Tacos"}`); rec.Code != http.StatusOK {
		t.Errorf("valid entry: got %d, want 200 (%s)", rec.Code, rec.Body)
	}
}

func TestMealplanWeekDefaultsToSunday(t *testing.T) {
	mux := newTestMux(t)
	resp := getWeek(t, mux, "/api/widgets/mealplan/week")

	day, err := time.Parse("2006-01-02", resp.Start)
	if err != nil {
		t.Fatalf("default start %q is not a valid date: %v", resp.Start, err)
	}
	if day.Weekday() != time.Sunday {
		t.Errorf("default start %s is a %s, want Sunday", resp.Start, day.Weekday())
	}
}

func TestMealplanWeekWindow(t *testing.T) {
	mux := newTestMux(t)

	// The window for start=2026-07-05 (a Sunday) is [2026-07-05, 2026-07-11]
	// inclusive. Seed the two boundary days plus one day past the end.
	set := func(day, slot, text string) {
		body := `{"day":"` + day + `","slot":"` + slot + `","text":"` + text + `"}`
		if rec := doJSON(t, mux, "PUT", "/api/widgets/mealplan/entry", body); rec.Code != http.StatusOK {
			t.Fatalf("set %s/%s: %d %s", day, slot, rec.Code, rec.Body)
		}
	}
	set("2026-07-05", "breakfast", "Pancakes") // first day of window
	set("2026-07-11", "dinner", "Roast")       // last day of window
	set("2026-07-12", "dinner", "Leftovers")   // day after the window

	resp := getWeek(t, mux, "/api/widgets/mealplan/week?start=2026-07-05")
	if resp.Start != "2026-07-05" {
		t.Errorf("start echoed: got %q, want 2026-07-05", resp.Start)
	}
	if len(resp.Entries) != 2 {
		t.Fatalf("window entries: got %d (%+v), want 2", len(resp.Entries), resp.Entries)
	}
	gotDays := []string{resp.Entries[0].Day, resp.Entries[1].Day}
	if gotDays[0] != "2026-07-05" || gotDays[1] != "2026-07-11" {
		t.Errorf("window days: got %v, want [2026-07-05 2026-07-11]", gotDays)
	}

	// Empty text deletes: clearing the first-day breakfast leaves only Roast.
	set("2026-07-05", "breakfast", "")
	resp = getWeek(t, mux, "/api/widgets/mealplan/week?start=2026-07-05")
	if len(resp.Entries) != 1 || resp.Entries[0].Text != "Roast" {
		t.Fatalf("after clearing breakfast: got %+v, want only Roast", resp.Entries)
	}

	// A malformed start is rejected.
	if rec := doJSON(t, mux, "GET", "/api/widgets/mealplan/week?start=nope", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad start: got %d, want 400 (%s)", rec.Code, rec.Body)
	}
}
