package word

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/zandoh/hearth/internal/sse"
)

func TestPackEntriesAreComplete(t *testing.T) {
	if len(pack) < 50 {
		t.Fatalf("pack has %d words; a thin pack repeats too often", len(pack))
	}
	seen := map[string]bool{}
	for _, e := range pack {
		if e.Word == "" || e.POS == "" || e.Definition == "" || e.Example == "" {
			t.Errorf("incomplete entry: %+v", e)
		}
		if seen[e.Word] {
			t.Errorf("duplicate word %q", e.Word)
		}
		seen[e.Word] = true
	}
}

func TestWordForIsDeterministicAndDaily(t *testing.T) {
	day := time.Date(2026, time.July, 13, 8, 0, 0, 0, time.UTC)
	if wordFor(day) != wordFor(day.Add(10*time.Hour)) {
		t.Error("same day, different word")
	}
	if wordFor(day) == wordFor(day.AddDate(0, 0, 1)) {
		t.Error("consecutive days repeated a word")
	}
	// Pre-epoch dates must not panic or go negative.
	_ = wordFor(time.Date(2019, time.June, 1, 0, 0, 0, 0, time.UTC))
}

func TestTodayEndpoint(t *testing.T) {
	w := New(sse.NewHub())
	w.now = func() time.Time { return time.Date(2026, time.July, 13, 8, 0, 0, 0, time.UTC) }
	mux := http.NewServeMux()
	w.Routes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/widgets/word/today", nil))

	var res struct {
		Day, Word, POS, Definition, Example string
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Day != "2026-07-13" || res.Word == "" || res.Definition == "" {
		t.Errorf("today = %+v", res)
	}
}

func TestRolloverPublishesOnlyOnDayFlip(t *testing.T) {
	w := New(sse.NewHub())
	now := time.Date(2026, time.July, 13, 23, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }
	job := w.Jobs()[0]

	// First run primes the day; no flip yet.
	if err := job.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if w.published != "2026-07-13" {
		t.Errorf("published = %q", w.published)
	}

	// Same day: still primed, no change.
	if err := job.Run(t.Context()); err != nil {
		t.Fatal(err)
	}

	// Midnight passes: the day flips.
	now = now.Add(2 * time.Hour)
	if err := job.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if w.published != "2026-07-14" {
		t.Errorf("published = %q, want the new day", w.published)
	}
}
