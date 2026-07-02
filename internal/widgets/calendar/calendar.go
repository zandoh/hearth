// Package calendar is Hearth's flagship widget: local household calendars
// plus any number of Google Calendars, merged into one event feed. Google
// calendars sync on a background job; event writes to them go through to
// the Google API immediately.
package calendar

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

// Sync window: far enough back for "what was that appointment?", far enough
// forward for school-year planning.
const (
	syncPast     = 30 * 24 * time.Hour
	syncFuture   = 400 * 24 * time.Hour
	syncEvery    = 5 * time.Minute
	tokenSetting = "google_calendar_token"
)

type Widget struct {
	store  *store.Store
	hub    *sse.Hub
	google *googleClient

	stateMu     sync.Mutex
	oauthStates map[string]time.Time
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	baseURL := os.Getenv("HEARTH_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	w := &Widget{
		store:       st,
		hub:         hub,
		oauthStates: make(map[string]time.Time),
	}
	w.google = &googleClient{
		clientID:     os.Getenv("HEARTH_GOOGLE_CLIENT_ID"),
		clientSecret: os.Getenv("HEARTH_GOOGLE_CLIENT_SECRET"),
		redirectURL:  strings.TrimSuffix(baseURL, "/") + "/api/widgets/calendar/google/callback",
		http:         &http.Client{Timeout: 30 * time.Second},
		loadToken: func() (googleToken, error) {
			raw, err := st.GetSetting(tokenSetting)
			if err != nil {
				return googleToken{}, err
			}
			var tok googleToken
			err = json.Unmarshal([]byte(raw), &tok)
			return tok, err
		},
		saveToken: func(tok googleToken) error {
			b, err := json.Marshal(tok)
			if err != nil {
				return err
			}
			return st.SetSetting(tokenSetting, string(b))
		},
	}
	return w
}

func (w *Widget) ID() string { return "calendar" }

func (w *Widget) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "google-sync",
		Interval: syncEvery,
		Run:      w.syncAll,
	}}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/calendar/calendars", w.handleListCalendars)
	mux.HandleFunc("POST /api/widgets/calendar/calendars", w.handleCreateCalendar)
	mux.HandleFunc("PUT /api/widgets/calendar/calendars/{id}", w.handleUpdateCalendar)
	mux.HandleFunc("DELETE /api/widgets/calendar/calendars/{id}", w.handleDeleteCalendar)

	mux.HandleFunc("GET /api/widgets/calendar/events", w.handleListEvents)
	mux.HandleFunc("POST /api/widgets/calendar/events", w.handleCreateEvent)
	mux.HandleFunc("PUT /api/widgets/calendar/events/{id}", w.handleUpdateEvent)
	mux.HandleFunc("DELETE /api/widgets/calendar/events/{id}", w.handleDeleteEvent)

	mux.HandleFunc("POST /api/widgets/calendar/sync", w.handleSyncNow)

	mux.HandleFunc("GET /api/widgets/calendar/google/status", w.handleGoogleStatus)
	mux.HandleFunc("GET /api/widgets/calendar/google/connect", w.handleGoogleConnect)
	mux.HandleFunc("GET /api/widgets/calendar/google/callback", w.handleGoogleCallback)
	mux.HandleFunc("GET /api/widgets/calendar/google/available", w.handleGoogleAvailable)
	mux.HandleFunc("POST /api/widgets/calendar/google/disconnect", w.handleGoogleDisconnect)
}

// --- helpers ---

func writeJSON(rw http.ResponseWriter, status int, v any) {
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	json.NewEncoder(rw).Encode(v)
}

func writeErr(rw http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeJSON(rw, http.StatusNotFound, map[string]string{"error": "not found"})
	case errors.Is(err, errNotConnected):
		writeJSON(rw, http.StatusConflict, map[string]string{"error": "google account not connected"})
	default:
		slog.Error("calendar request failed", "err", err)
		writeJSON(rw, http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
}

func badRequest(rw http.ResponseWriter, msg string) {
	writeJSON(rw, http.StatusBadRequest, map[string]string{"error": msg})
}

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}

func base64URLDecode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// --- calendars ---

func (w *Widget) handleListCalendars(rw http.ResponseWriter, r *http.Request) {
	cals, err := w.store.ListCalendars()
	if err != nil {
		writeErr(rw, err)
		return
	}
	writeJSON(rw, http.StatusOK, cals)
}

func (w *Widget) handleCreateCalendar(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Color    string `json:"color"`
		GoogleID string `json:"googleId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(rw, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		badRequest(rw, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#4f6df5"
	}
	kind := "local"
	if req.GoogleID != "" {
		kind = "google"
	}
	cal, err := w.store.CreateCalendar(req.Name, req.Color, kind, req.GoogleID)
	if err != nil {
		writeErr(rw, err)
		return
	}
	// Pull the new Google calendar's events right away rather than waiting
	// for the next sync tick.
	if kind == "google" {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			if err := w.syncOne(ctx, cal); err != nil {
				slog.Error("initial calendar sync", "calendar", cal.Name, "err", err)
			}
		}()
	}
	w.hub.Publish("calendar", "changed")
	writeJSON(rw, http.StatusCreated, cal)
}

func (w *Widget) handleUpdateCalendar(rw http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		badRequest(rw, "invalid id")
		return
	}
	var req struct {
		Name    string `json:"name"`
		Color   string `json:"color"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		badRequest(rw, "name is required")
		return
	}
	cal, err := w.store.UpdateCalendar(id, req.Name, req.Color, req.Enabled)
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	writeJSON(rw, http.StatusOK, cal)
}

func (w *Widget) handleDeleteCalendar(rw http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		badRequest(rw, "invalid id")
		return
	}
	// Deleting a Google calendar here only removes it from Hearth; the
	// calendar itself is untouched on Google's side.
	if err := w.store.DeleteCalendar(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	rw.WriteHeader(http.StatusNoContent)
}

// --- events ---

func (w *Widget) handleListEvents(rw http.ResponseWriter, r *http.Request) {
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start == "" || end == "" {
		badRequest(rw, "start and end query params are required (RFC3339)")
		return
	}
	events, err := w.store.EventsBetween(start, end)
	if err != nil {
		writeErr(rw, err)
		return
	}
	writeJSON(rw, http.StatusOK, events)
}

type eventRequest struct {
	CalendarID int64  `json:"calendarId"`
	Title      string `json:"title"`
	StartsAt   string `json:"startsAt"`
	EndsAt     string `json:"endsAt"`
	AllDay     bool   `json:"allDay"`
	Location   string `json:"location"`
	Notes      string `json:"notes"`
}

func (req *eventRequest) validate() error {
	if strings.TrimSpace(req.Title) == "" {
		return errors.New("title is required")
	}
	layout := time.RFC3339
	if req.AllDay {
		layout = "2006-01-02"
	}
	start, err := time.Parse(layout, req.StartsAt)
	if err != nil {
		return fmt.Errorf("startsAt: want %s", layout)
	}
	if req.EndsAt == "" {
		// Default: one hour, or single all-day day (exclusive end).
		if req.AllDay {
			req.EndsAt = start.AddDate(0, 0, 1).Format(layout)
		} else {
			req.EndsAt = start.Add(time.Hour).Format(layout)
		}
		return nil
	}
	end, err := time.Parse(layout, req.EndsAt)
	if err != nil {
		return fmt.Errorf("endsAt: want %s", layout)
	}
	if !end.After(start) {
		return errors.New("endsAt must be after startsAt")
	}
	return nil
}

func (req *eventRequest) toGcal() gcalEvent {
	ev := gcalEvent{
		Summary:     req.Title,
		Location:    req.Location,
		Description: req.Notes,
	}
	if req.AllDay {
		ev.Start = gcalTime{Date: req.StartsAt}
		ev.End = gcalTime{Date: req.EndsAt}
	} else {
		ev.Start = gcalTime{DateTime: req.StartsAt}
		ev.End = gcalTime{DateTime: req.EndsAt}
	}
	return ev
}

func (w *Widget) handleCreateEvent(rw http.ResponseWriter, r *http.Request) {
	var req eventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(rw, "invalid JSON body")
		return
	}
	if err := req.validate(); err != nil {
		badRequest(rw, err.Error())
		return
	}
	cal, err := w.store.GetCalendar(req.CalendarID)
	if err != nil {
		writeErr(rw, err)
		return
	}

	externalID := ""
	if cal.Kind == "google" {
		// Write-through: Google is the source of truth for its calendars.
		created, err := w.google.insertEvent(r.Context(), cal.GoogleID, req.toGcal())
		if err != nil {
			writeErr(rw, err)
			return
		}
		externalID = created.ID
	}

	event, err := w.store.CreateEvent(store.Event{
		CalendarID: cal.ID,
		ExternalID: externalID,
		Title:      req.Title,
		StartsAt:   req.StartsAt,
		EndsAt:     req.EndsAt,
		AllDay:     req.AllDay,
		Location:   req.Location,
		Notes:      req.Notes,
	})
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	writeJSON(rw, http.StatusCreated, event)
}

func (w *Widget) handleUpdateEvent(rw http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		badRequest(rw, "invalid id")
		return
	}
	var req eventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(rw, "invalid JSON body")
		return
	}
	if err := req.validate(); err != nil {
		badRequest(rw, err.Error())
		return
	}
	existing, err := w.store.GetEvent(id)
	if err != nil {
		writeErr(rw, err)
		return
	}
	cal, err := w.store.GetCalendar(existing.CalendarID)
	if err != nil {
		writeErr(rw, err)
		return
	}
	if cal.Kind == "google" && existing.ExternalID != "" {
		if err := w.google.updateEvent(r.Context(), cal.GoogleID, existing.ExternalID, req.toGcal()); err != nil {
			writeErr(rw, err)
			return
		}
	}
	event, err := w.store.UpdateEvent(store.Event{
		ID:       id,
		Title:    req.Title,
		StartsAt: req.StartsAt,
		EndsAt:   req.EndsAt,
		AllDay:   req.AllDay,
		Location: req.Location,
		Notes:    req.Notes,
	})
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	writeJSON(rw, http.StatusOK, event)
}

func (w *Widget) handleDeleteEvent(rw http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		badRequest(rw, "invalid id")
		return
	}
	existing, err := w.store.GetEvent(id)
	if err != nil {
		writeErr(rw, err)
		return
	}
	cal, err := w.store.GetCalendar(existing.CalendarID)
	if err != nil {
		writeErr(rw, err)
		return
	}
	if cal.Kind == "google" && existing.ExternalID != "" {
		if err := w.google.deleteEvent(r.Context(), cal.GoogleID, existing.ExternalID); err != nil {
			writeErr(rw, err)
			return
		}
	}
	if err := w.store.DeleteEvent(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	rw.WriteHeader(http.StatusNoContent)
}

// --- sync ---

func (w *Widget) syncAll(ctx context.Context) error {
	cals, err := w.store.ListCalendars()
	if err != nil {
		return err
	}
	var synced int
	var errs []error
	for _, cal := range cals {
		if cal.Kind != "google" {
			continue
		}
		if err := w.syncOne(ctx, cal); err != nil {
			// One broken calendar shouldn't block the others.
			errs = append(errs, fmt.Errorf("%s: %w", cal.Name, err))
			continue
		}
		synced++
	}
	if synced > 0 {
		w.hub.Publish("calendar", "changed")
	}
	if len(errs) > 0 && !errors.Is(errs[0], errNotConnected) {
		return errors.Join(errs...)
	}
	return nil
}

func (w *Widget) syncOne(ctx context.Context, cal store.Calendar) error {
	now := time.Now()
	gcalEvents, err := w.google.listEvents(ctx, cal.GoogleID, now.Add(-syncPast), now.Add(syncFuture))
	if err != nil {
		return err
	}
	events := make([]store.Event, 0, len(gcalEvents))
	for _, ge := range gcalEvents {
		if ge.Status == "cancelled" {
			continue
		}
		events = append(events, gcalToEvent(ge))
	}
	return w.store.ReplaceGoogleEvents(cal.ID, events)
}

func gcalToEvent(ge gcalEvent) store.Event {
	e := store.Event{
		ExternalID: ge.ID,
		Title:      ge.Summary,
		Location:   ge.Location,
		Notes:      ge.Description,
	}
	if e.Title == "" {
		e.Title = "(untitled)"
	}
	if ge.Start.Date != "" {
		e.AllDay = true
		e.StartsAt = ge.Start.Date
		e.EndsAt = ge.End.Date
	} else {
		e.StartsAt = ge.Start.DateTime
		e.EndsAt = ge.End.DateTime
	}
	return e
}

func (w *Widget) handleSyncNow(rw http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), time.Minute)
	defer cancel()
	if err := w.syncAll(ctx); err != nil {
		writeErr(rw, err)
		return
	}
	writeJSON(rw, http.StatusOK, map[string]string{"status": "synced"})
}

// --- Google account connection ---

func (w *Widget) handleGoogleStatus(rw http.ResponseWriter, r *http.Request) {
	status := map[string]any{
		"configured": w.google.configured(),
		"connected":  false,
		"email":      "",
	}
	if tok, err := w.google.loadToken(); err == nil {
		status["connected"] = true
		status["email"] = tok.Email
	}
	writeJSON(rw, http.StatusOK, status)
}

func (w *Widget) newOAuthState() string {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)
	w.stateMu.Lock()
	defer w.stateMu.Unlock()
	// Drop stale entries from abandoned attempts.
	for s, t := range w.oauthStates {
		if time.Since(t) > 15*time.Minute {
			delete(w.oauthStates, s)
		}
	}
	w.oauthStates[state] = time.Now()
	return state
}

func (w *Widget) consumeOAuthState(state string) bool {
	w.stateMu.Lock()
	defer w.stateMu.Unlock()
	t, ok := w.oauthStates[state]
	delete(w.oauthStates, state)
	return ok && time.Since(t) <= 15*time.Minute
}

func (w *Widget) handleGoogleConnect(rw http.ResponseWriter, r *http.Request) {
	if !w.google.configured() {
		writeJSON(rw, http.StatusConflict, map[string]string{
			"error": "set HEARTH_GOOGLE_CLIENT_ID and HEARTH_GOOGLE_CLIENT_SECRET (see README)",
		})
		return
	}
	http.Redirect(rw, r, w.google.authURL(w.newOAuthState()), http.StatusFound)
}

func (w *Widget) handleGoogleCallback(rw http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if errMsg := q.Get("error"); errMsg != "" {
		http.Error(rw, "google authorization failed: "+errMsg, http.StatusBadRequest)
		return
	}
	if !w.consumeOAuthState(q.Get("state")) {
		http.Error(rw, "invalid oauth state — start the connect flow again", http.StatusBadRequest)
		return
	}
	if err := w.google.exchange(r.Context(), q.Get("code")); err != nil {
		slog.Error("google token exchange", "err", err)
		http.Error(rw, "token exchange failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	w.hub.Publish("calendar", "changed")
	// Back to the app; the settings dialog re-checks /google/status.
	http.Redirect(rw, r, "/", http.StatusFound)
}

func (w *Widget) handleGoogleAvailable(rw http.ResponseWriter, r *http.Request) {
	gcals, err := w.google.listCalendars(r.Context())
	if err != nil {
		writeErr(rw, err)
		return
	}
	existing, err := w.store.ListCalendars()
	if err != nil {
		writeErr(rw, err)
		return
	}
	added := make(map[string]bool, len(existing))
	for _, c := range existing {
		if c.GoogleID != "" {
			added[c.GoogleID] = true
		}
	}
	type available struct {
		GoogleID string `json:"googleId"`
		Name     string `json:"name"`
		Color    string `json:"color"`
		Primary  bool   `json:"primary"`
		Added    bool   `json:"added"`
	}
	out := []available{}
	for _, gc := range gcals {
		out = append(out, available{
			GoogleID: gc.ID,
			Name:     gc.Summary,
			Color:    gc.Color,
			Primary:  gc.Primary,
			Added:    added[gc.ID],
		})
	}
	writeJSON(rw, http.StatusOK, out)
}

func (w *Widget) handleGoogleDisconnect(rw http.ResponseWriter, r *http.Request) {
	if err := w.store.DeleteSetting(tokenSetting); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("calendar", "changed")
	writeJSON(rw, http.StatusOK, map[string]string{"status": "disconnected"})
}
