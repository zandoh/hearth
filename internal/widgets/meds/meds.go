// Package meds: medication schedules with dose tracking, so "did grandma
// take her evening pill?" has an answer on the kiosk. Slots are semantic —
// AM, PM, daily, weekly — and check-offs reset with their window: daily
// slots at midnight, weekly slots at the start of the week (Monday).
package meds

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

// Semantic slots plus legacy HH:MM entries (treated as daily).
var slotRe = regexp.MustCompile(`^(AM|PM|daily|weekly|([01]\d|2[0-3]):[0-5]\d)$`)

// weekStart returns the Monday of now's week, YYYY-MM-DD.
func weekStart(now time.Time) string {
	back := (int(now.Weekday()) + 6) % 7 // Mon=0 ... Sun=6
	return now.AddDate(0, 0, -back).Format("2006-01-02")
}

// slotWindow is the reset window for a slot as of now: the current day for
// daily-style slots, the current week for weekly ones.
func slotWindow(slot string, now time.Time) (start, end string) {
	today := now.Format("2006-01-02")
	if slot == "weekly" {
		return weekStart(now), today
	}
	return today, today
}

type Widget struct {
	widget.Base
	store *store.Store
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{Base: widget.Base{Hub: hub, Slug: "meds"}, store: st}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/meds/today", w.handleToday)
	mux.HandleFunc("POST /api/widgets/meds", w.handleCreate)
	mux.HandleFunc("DELETE /api/widgets/meds/{id}", w.handleDelete)
	mux.HandleFunc("POST /api/widgets/meds/{id}/toggle", w.handleToggleDose)
}

func (w *Widget) handleToday(rw http.ResponseWriter, r *http.Request) {
	meds, err := w.store.ListMedications()
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	now := time.Now()
	day := now.Format("2006-01-02")
	// Two windows: daily-style slots reset at midnight, weekly slots at the
	// start of the week.
	takenToday, err := w.store.TakenDosesBetween(day, day)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	takenWeek, err := w.store.TakenDosesBetween(weekStart(now), day)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	key := func(medID int64, slot string) string {
		return strconv.FormatInt(medID, 10) + "|" + slot
	}
	todaySet := make(map[string]bool, len(takenToday))
	for _, d := range takenToday {
		todaySet[key(d.MedicationID, d.Slot)] = true
	}
	weekSet := make(map[string]bool, len(takenWeek))
	for _, d := range takenWeek {
		weekSet[key(d.MedicationID, d.Slot)] = true
	}
	takenNow := func(medID int64, slot string) bool {
		if slot == "weekly" {
			return weekSet[key(medID, slot)]
		}
		return todaySet[key(medID, slot)]
	}
	type dose struct {
		Slot  string `json:"slot"`
		Taken bool   `json:"taken"`
	}
	type medView struct {
		store.Medication
		Doses []dose `json:"doses"`
	}
	out := make([]medView, 0, len(meds))
	for _, m := range meds {
		mv := medView{Medication: m, Doses: []dose{}}
		for _, slot := range m.Times {
			mv.Doses = append(mv.Doses, dose{Slot: slot, Taken: takenNow(m.ID, slot)})
		}
		out = append(out, mv)
	}
	httpx.JSON(rw, http.StatusOK, map[string]any{"day": day, "medications": out})
}

func (w *Widget) handleCreate(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string   `json:"name"`
		Person string   `json:"person"`
		Times  []string `json:"times"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Name) == "" {
		httpx.BadRequest(rw, "name is required")
		return
	}
	if len(req.Times) == 0 {
		httpx.BadRequest(rw, "at least one dose time is required")
		return
	}
	for _, t := range req.Times {
		if !slotRe.MatchString(t) {
			httpx.BadRequest(rw, "slots must be AM, PM, daily, weekly, or HH:MM: "+t)
			return
		}
	}
	med, err := w.store.CreateMedication(
		strings.TrimSpace(req.Name), strings.TrimSpace(req.Person), req.Times)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	httpx.JSON(rw, http.StatusCreated, med)
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteMedication(id); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	rw.WriteHeader(http.StatusNoContent)
}

func (w *Widget) handleToggleDose(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	var req struct {
		Slot string `json:"slot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !slotRe.MatchString(req.Slot) {
		httpx.BadRequest(rw, "slot (AM, PM, daily, weekly, or HH:MM) is required")
		return
	}
	now := time.Now()
	start, end := slotWindow(req.Slot, now)
	takenNow, err := w.store.ToggleDose(id, req.Slot, now.Format("2006-01-02"), start, end)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	httpx.JSON(rw, http.StatusOK, map[string]bool{"taken": takenNow})
}
