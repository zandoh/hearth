package calendar

// Sync and write-through tests drive the widget through the gcalAPI seam:
// a fake adapter stands in for Google, the store is real SQLite.

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
)

type fakeGoogle struct {
	events   map[string][]gcalEvent // google calendar id → events served by listEvents
	inserted []gcalEvent
	updated  []string // external event ids
	deleted  []string
	nextID   int
}

func (f *fakeGoogle) configured() bool                                { return true }
func (f *fakeGoogle) authURL(state string) string                     { return "https://fake/auth?state=" + state }
func (f *fakeGoogle) exchange(ctx context.Context, code string) error { return nil }
func (f *fakeGoogle) token() (googleToken, error) {
	return googleToken{Email: "family@example.com"}, nil
}
func (f *fakeGoogle) listCalendars(ctx context.Context) ([]gcalCalendar, error) { return nil, nil }
func (f *fakeGoogle) listEvents(ctx context.Context, calendarID string, timeMin, timeMax time.Time) ([]gcalEvent, error) {
	return f.events[calendarID], nil
}
func (f *fakeGoogle) insertEvent(ctx context.Context, calendarID string, ev gcalEvent) (gcalEvent, error) {
	f.nextID++
	ev.ID = fmt.Sprintf("gcal-%d", f.nextID)
	f.inserted = append(f.inserted, ev)
	return ev, nil
}
func (f *fakeGoogle) updateEvent(ctx context.Context, calendarID, eventID string, ev gcalEvent) error {
	f.updated = append(f.updated, eventID)
	return nil
}
func (f *fakeGoogle) deleteEvent(ctx context.Context, calendarID, eventID string) error {
	f.deleted = append(f.deleted, eventID)
	return nil
}

func newTestWidget(t *testing.T) (*Widget, *fakeGoogle, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	w := New(st, sse.NewHub(), Config{})
	fake := &fakeGoogle{events: map[string][]gcalEvent{}}
	w.google = fake
	return w, fake, st
}

func allEvents(t *testing.T, st *store.Store) []store.Event {
	t.Helper()
	events, err := st.EventsBetween("2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	return events
}

func TestSyncOneReplacesEventsAndSkipsCancelled(t *testing.T) {
	w, fake, st := newTestWidget(t)
	cal, err := st.CreateCalendar("Family", "#fff", "google", "gid-1")
	if err != nil {
		t.Fatal(err)
	}
	fake.events["gid-1"] = []gcalEvent{
		{ID: "a", Summary: "Dentist",
			Start: gcalTime{DateTime: "2026-07-10T14:00:00Z"}, End: gcalTime{DateTime: "2026-07-10T15:00:00Z"}},
		{ID: "b", Summary: "Cancelled thing", Status: "cancelled",
			Start: gcalTime{DateTime: "2026-07-11T14:00:00Z"}, End: gcalTime{DateTime: "2026-07-11T15:00:00Z"}},
		{ID: "c", Summary: "Vacation",
			Start: gcalTime{Date: "2026-08-01"}, End: gcalTime{Date: "2026-08-08"}},
	}

	if err := w.syncOne(context.Background(), cal); err != nil {
		t.Fatal(err)
	}
	events := allEvents(t, st)
	if len(events) != 2 {
		t.Fatalf("got %d events, want 2 (cancelled skipped): %+v", len(events), events)
	}

	// A second sync replaces, not appends.
	fake.events["gid-1"] = fake.events["gid-1"][:1] // Dentist only
	if err := w.syncOne(context.Background(), cal); err != nil {
		t.Fatal(err)
	}
	events = allEvents(t, st)
	if len(events) != 1 || events[0].Title != "Dentist" {
		t.Fatalf("resync should replace the window: %+v", events)
	}
}

func TestSyncAllOnlyTouchesGoogleCalendars(t *testing.T) {
	w, fake, st := newTestWidget(t)
	local, err := st.CreateCalendar("Home", "#fff", "local", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateEvent(store.Event{CalendarID: local.ID, Title: "Local dinner",
		StartsAt: "2026-07-04T18:00:00Z", EndsAt: "2026-07-04T19:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateCalendar("Family", "#fff", "google", "gid-1"); err != nil {
		t.Fatal(err)
	}
	fake.events["gid-1"] = []gcalEvent{
		{ID: "a", Summary: "Synced",
			Start: gcalTime{DateTime: "2026-07-10T14:00:00Z"}, End: gcalTime{DateTime: "2026-07-10T15:00:00Z"}},
	}

	if err := w.syncAll(context.Background()); err != nil {
		t.Fatal(err)
	}
	events := allEvents(t, st)
	if len(events) != 2 {
		t.Fatalf("got %d events, want local + synced: %+v", len(events), events)
	}
}

func TestCreateEventWritesThroughToGoogle(t *testing.T) {
	w, fake, st := newTestWidget(t)
	gcal, err := st.CreateCalendar("Family", "#fff", "google", "gid-1")
	if err != nil {
		t.Fatal(err)
	}

	ev, err := w.createEvent(context.Background(), eventRequest{
		CalendarID: gcal.ID, Title: "Dentist",
		StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(fake.inserted) != 1 {
		t.Fatalf("google insert calls = %d, want 1", len(fake.inserted))
	}
	if ev.ExternalID != "gcal-1" {
		t.Errorf("event should carry the external id back from Google, got %q", ev.ExternalID)
	}
}

func TestCreateEventOnLocalCalendarSkipsGoogle(t *testing.T) {
	w, fake, st := newTestWidget(t)
	local, err := st.CreateCalendar("Home", "#fff", "local", "")
	if err != nil {
		t.Fatal(err)
	}

	ev, err := w.createEvent(context.Background(), eventRequest{
		CalendarID: local.ID, Title: "Dinner",
		StartsAt: "2026-07-04T18:00:00Z", EndsAt: "2026-07-04T19:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(fake.inserted) != 0 {
		t.Errorf("local calendars must not reach Google, got %d inserts", len(fake.inserted))
	}
	if ev.ExternalID != "" {
		t.Errorf("local event should have no external id, got %q", ev.ExternalID)
	}
}

func TestUpdateAndDeleteEventWriteThrough(t *testing.T) {
	w, fake, st := newTestWidget(t)
	gcal, err := st.CreateCalendar("Family", "#fff", "google", "gid-1")
	if err != nil {
		t.Fatal(err)
	}
	ev, err := st.CreateEvent(store.Event{CalendarID: gcal.ID, ExternalID: "ext-1",
		Title: "Dentist", StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := w.updateEvent(context.Background(), ev.ID, eventRequest{
		Title: "Dentist (moved)", StartsAt: "2026-07-11T14:00:00Z", EndsAt: "2026-07-11T15:00:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	if len(fake.updated) != 1 || fake.updated[0] != "ext-1" {
		t.Errorf("google update calls = %v, want [ext-1]", fake.updated)
	}

	if err := w.deleteEvent(context.Background(), ev.ID); err != nil {
		t.Fatal(err)
	}
	if len(fake.deleted) != 1 || fake.deleted[0] != "ext-1" {
		t.Errorf("google delete calls = %v, want [ext-1]", fake.deleted)
	}
	if _, err := st.GetEvent(ev.ID); err != store.ErrNotFound {
		t.Errorf("event should be gone locally, got err=%v", err)
	}
}

func TestUpdateEventWithoutExternalIDSkipsGoogle(t *testing.T) {
	w, fake, st := newTestWidget(t)
	gcal, err := st.CreateCalendar("Family", "#fff", "google", "gid-1")
	if err != nil {
		t.Fatal(err)
	}
	// Synced calendars can hold rows created before connect; no external id
	// means nothing to mirror.
	ev, err := st.CreateEvent(store.Event{CalendarID: gcal.ID,
		Title: "Orphan", StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.updateEvent(context.Background(), ev.ID, eventRequest{
		Title: "Orphan 2", StartsAt: "2026-07-10T14:00:00Z", EndsAt: "2026-07-10T15:00:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	if len(fake.updated) != 0 {
		t.Errorf("no external id → no Google call, got %v", fake.updated)
	}
}
