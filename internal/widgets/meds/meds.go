// Package meds: medication schedules with per-day dose tracking, so
// "did grandma take her evening pill?" has an answer on the kiosk.
package meds

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

var slotRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

type Widget struct {
	store *store.Store
	hub   *sse.Hub
}

func New(st *store.Store, hub *sse.Hub) *Widget { return &Widget{store: st, hub: hub} }

func (w *Widget) ID() string         { return "meds" }
func (w *Widget) Jobs() []widget.Job { return nil }

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/meds/today", w.handleToday)
	mux.HandleFunc("POST /api/widgets/meds", w.handleCreate)
	mux.HandleFunc("DELETE /api/widgets/meds/{id}", w.handleDelete)
	mux.HandleFunc("POST /api/widgets/meds/{id}/toggle", w.handleToggleDose)
}

func (w *Widget) handleToday(rw http.ResponseWriter, r *http.Request) {
	meds, err := w.store.ListMedications()
	if err != nil {
		writeErr(rw, err)
		return
	}
	day := time.Now().Format("2006-01-02")
	taken, err := w.store.TakenDoses(day)
	if err != nil {
		writeErr(rw, err)
		return
	}
	takenSet := make(map[string]bool, len(taken))
	for _, d := range taken {
		takenSet[strconv.FormatInt(d.MedicationID, 10)+"|"+d.Slot] = true
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
			mv.Doses = append(mv.Doses, dose{
				Slot:  slot,
				Taken: takenSet[strconv.FormatInt(m.ID, 10)+"|"+slot],
			})
		}
		out = append(out, mv)
	}
	writeJSON(rw, http.StatusOK, map[string]any{"day": day, "medications": out})
}

func (w *Widget) handleCreate(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string   `json:"name"`
		Person string   `json:"person"`
		Times  []string `json:"times"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Name) == "" {
		badRequest(rw, "name is required")
		return
	}
	if len(req.Times) == 0 {
		badRequest(rw, "at least one dose time is required")
		return
	}
	for _, t := range req.Times {
		if !slotRe.MatchString(t) {
			badRequest(rw, "dose times must be HH:MM (24h): "+t)
			return
		}
	}
	med, err := w.store.CreateMedication(
		strings.TrimSpace(req.Name), strings.TrimSpace(req.Person), req.Times)
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("meds", "changed")
	writeJSON(rw, http.StatusCreated, med)
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteMedication(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("meds", "changed")
	rw.WriteHeader(http.StatusNoContent)
}

func (w *Widget) handleToggleDose(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	var req struct {
		Slot string `json:"slot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !slotRe.MatchString(req.Slot) {
		badRequest(rw, "slot (HH:MM) is required")
		return
	}
	takenNow, err := w.store.ToggleDose(id, time.Now().Format("2006-01-02"), req.Slot)
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("meds", "changed")
	writeJSON(rw, http.StatusOK, map[string]bool{"taken": takenNow})
}

func writeJSON(rw http.ResponseWriter, status int, v any) {
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	json.NewEncoder(rw).Encode(v)
}

func writeErr(rw http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(rw, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	slog.Error("meds request failed", "err", err)
	writeJSON(rw, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}

func badRequest(rw http.ResponseWriter, msg string) {
	writeJSON(rw, http.StatusBadRequest, map[string]string{"error": msg})
}
