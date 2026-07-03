package meds

import (
	"testing"
	"time"
)

func TestWeekStartIsMonday(t *testing.T) {
	cases := map[string]string{
		"2026-07-02": "2026-06-29", // Thursday -> Monday
		"2026-06-29": "2026-06-29", // Monday -> itself
		"2026-07-05": "2026-06-29", // Sunday -> previous Monday
	}
	for in, want := range cases {
		now, _ := time.Parse("2006-01-02", in)
		if got := weekStart(now); got != want {
			t.Errorf("weekStart(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestSlotWindow(t *testing.T) {
	now, _ := time.Parse("2006-01-02", "2026-07-02")
	if s, e := slotWindow("AM", now); s != "2026-07-02" || e != "2026-07-02" {
		t.Errorf("AM window = %s..%s, want today only", s, e)
	}
	if s, e := slotWindow("weekly", now); s != "2026-06-29" || e != "2026-07-02" {
		t.Errorf("weekly window = %s..%s, want Monday..today", s, e)
	}
}
