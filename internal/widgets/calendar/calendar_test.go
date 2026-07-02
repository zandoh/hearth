package calendar

import (
	"encoding/base64"
	"testing"
)

func base64URLEncode(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func TestGcalToEvent(t *testing.T) {
	tests := []struct {
		name string
		in   gcalEvent
		want struct {
			title, start, end string
			allDay            bool
		}
	}{
		{
			name: "timed event",
			in: gcalEvent{
				ID:      "abc123",
				Summary: "Dentist",
				Start:   gcalTime{DateTime: "2026-07-10T14:00:00-04:00"},
				End:     gcalTime{DateTime: "2026-07-10T15:00:00-04:00"},
			},
			want: struct {
				title, start, end string
				allDay            bool
			}{"Dentist", "2026-07-10T14:00:00-04:00", "2026-07-10T15:00:00-04:00", false},
		},
		{
			name: "all-day event uses date form",
			in: gcalEvent{
				Summary: "Vacation",
				Start:   gcalTime{Date: "2026-08-01"},
				End:     gcalTime{Date: "2026-08-08"},
			},
			want: struct {
				title, start, end string
				allDay            bool
			}{"Vacation", "2026-08-01", "2026-08-08", true},
		},
		{
			name: "untitled event gets placeholder",
			in: gcalEvent{
				Start: gcalTime{DateTime: "2026-07-10T14:00:00Z"},
				End:   gcalTime{DateTime: "2026-07-10T15:00:00Z"},
			},
			want: struct {
				title, start, end string
				allDay            bool
			}{"(untitled)", "2026-07-10T14:00:00Z", "2026-07-10T15:00:00Z", false},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := gcalToEvent(tt.in)
			if got.Title != tt.want.title || got.StartsAt != tt.want.start ||
				got.EndsAt != tt.want.end || got.AllDay != tt.want.allDay {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestEventRequestValidate(t *testing.T) {
	valid := eventRequest{Title: "x", StartsAt: "2026-07-10T14:00:00-04:00"}
	if err := valid.validate(); err != nil {
		t.Errorf("timed event without end should default: %v", err)
	}
	if valid.EndsAt != "2026-07-10T15:00:00-04:00" {
		t.Errorf("default end = %s, want one hour later", valid.EndsAt)
	}

	allDay := eventRequest{Title: "x", StartsAt: "2026-07-10", AllDay: true}
	if err := allDay.validate(); err != nil {
		t.Errorf("all-day event: %v", err)
	}
	if allDay.EndsAt != "2026-07-11" {
		t.Errorf("all-day default end = %s, want next day (exclusive)", allDay.EndsAt)
	}

	for name, bad := range map[string]eventRequest{
		"no title":           {StartsAt: "2026-07-10T14:00:00Z"},
		"date form on timed": {Title: "x", StartsAt: "2026-07-10"},
		"end before start": {Title: "x", StartsAt: "2026-07-10T14:00:00Z",
			EndsAt: "2026-07-10T13:00:00Z"},
	} {
		bad := bad
		if err := bad.validate(); err == nil {
			t.Errorf("%s: expected validation error", name)
		}
	}
}

func TestEmailFromIDToken(t *testing.T) {
	// JWT with payload {"email":"family@example.com"} (unsigned test token).
	payload := base64URLEncode([]byte(`{"email":"family@example.com"}`))
	token := "eyJhbGciOiJIUzI1NiJ9." + payload + ".sig"
	if got := emailFromIDToken(token); got != "family@example.com" {
		t.Errorf("got %q", got)
	}
	if got := emailFromIDToken("garbage"); got != "" {
		t.Errorf("garbage token should give empty email, got %q", got)
	}
}
