package store

import (
	"errors"
	"testing"
)

func TestCalendarSeedAndCRUD(t *testing.T) {
	s := openTestStore(t)

	cals, err := s.ListCalendars()
	if err != nil {
		t.Fatalf("ListCalendars: %v", err)
	}
	if len(cals) != 1 || cals[0].Name != "Household" || cals[0].Kind != "local" {
		t.Fatalf("seed = %+v, want one local Household calendar", cals)
	}

	g, err := s.CreateCalendar("Family", "#00ff00", "google", "family@group.calendar.google.com")
	if err != nil {
		t.Fatalf("CreateCalendar google: %v", err)
	}
	if g.Kind != "google" || g.GoogleID != "family@group.calendar.google.com" || !g.Enabled {
		t.Errorf("google calendar = %+v", g)
	}

	// google_id is UNIQUE: adding the same Google calendar twice must fail.
	if _, err := s.CreateCalendar("Dup", "#fff", "google", g.GoogleID); err == nil {
		t.Error("duplicate googleId should error")
	}

	updated, err := s.UpdateCalendar(g.ID, "Family Shared", "#112233", false)
	if err != nil {
		t.Fatalf("UpdateCalendar: %v", err)
	}
	if updated.Name != "Family Shared" || updated.Enabled {
		t.Errorf("updated = %+v", updated)
	}

	if err := s.DeleteCalendar(g.ID); err != nil {
		t.Fatalf("DeleteCalendar: %v", err)
	}
	if _, err := s.GetCalendar(g.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetCalendar after delete: %v", err)
	}
}

func TestEventsBetweenFiltersAndSorts(t *testing.T) {
	s := openTestStore(t)
	cals, _ := s.ListCalendars()
	home := cals[0].ID

	disabled, _ := s.CreateCalendar("Hidden", "#000", "local", "")
	if _, err := s.UpdateCalendar(disabled.ID, "Hidden", "#000", false); err != nil {
		t.Fatal(err)
	}

	mustCreate := func(e Event) Event {
		t.Helper()
		created, err := s.CreateEvent(e)
		if err != nil {
			t.Fatalf("CreateEvent %q: %v", e.Title, err)
		}
		return created
	}
	mustCreate(Event{CalendarID: home, Title: "in range",
		StartsAt: "2026-07-10T14:00:00-04:00", EndsAt: "2026-07-10T15:00:00-04:00"})
	mustCreate(Event{CalendarID: home, Title: "all-day in range", AllDay: true,
		StartsAt: "2026-07-11", EndsAt: "2026-07-12"})
	mustCreate(Event{CalendarID: home, Title: "before range",
		StartsAt: "2026-06-01T10:00:00-04:00", EndsAt: "2026-06-01T11:00:00-04:00"})
	mustCreate(Event{CalendarID: disabled.ID, Title: "on disabled calendar",
		StartsAt: "2026-07-10T14:00:00-04:00", EndsAt: "2026-07-10T15:00:00-04:00"})

	events, err := s.EventsBetween("2026-07-01", "2026-08-01")
	if err != nil {
		t.Fatalf("EventsBetween: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("got %d events %+v, want 2", len(events), events)
	}
	// All-day events sort first.
	if !events[0].AllDay || events[0].Title != "all-day in range" {
		t.Errorf("first event = %+v, want the all-day one", events[0])
	}
}

func TestReplaceGoogleEvents(t *testing.T) {
	s := openTestStore(t)
	cal, err := s.CreateCalendar("Family", "#00ff00", "google", "gid@example.com")
	if err != nil {
		t.Fatal(err)
	}

	first := []Event{
		{ExternalID: "a", Title: "A", StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z"},
		{ExternalID: "b", Title: "B", StartsAt: "2026-07-11T14:00:00Z", EndsAt: "2026-07-11T15:00:00Z"},
	}
	if err := s.ReplaceGoogleEvents(cal.ID, first); err != nil {
		t.Fatalf("first replace: %v", err)
	}

	// Second sync: "a" retitled, "b" gone, "c" new.
	second := []Event{
		{ExternalID: "a", Title: "A2", StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z"},
		{ExternalID: "c", Title: "C", StartsAt: "2026-07-12T14:00:00Z", EndsAt: "2026-07-12T15:00:00Z"},
	}
	if err := s.ReplaceGoogleEvents(cal.ID, second); err != nil {
		t.Fatalf("second replace: %v", err)
	}

	events, err := s.EventsBetween("2026-07-01", "2026-08-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 || events[0].Title != "A2" || events[1].Title != "C" {
		t.Errorf("after replace = %+v, want A2 and C", events)
	}

	// Deleting the calendar cascades to its events.
	if err := s.DeleteCalendar(cal.ID); err != nil {
		t.Fatal(err)
	}
	events, _ = s.EventsBetween("2026-07-01", "2026-08-01")
	if len(events) != 0 {
		t.Errorf("events after calendar delete = %+v, want none", events)
	}
}
