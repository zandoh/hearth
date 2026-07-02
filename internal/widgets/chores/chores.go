// Package chores: recurring household tasks on simple "every N days"
// intervals, with a tap-to-complete log.
package chores

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

type Widget struct {
	store *store.Store
	hub   *sse.Hub
}

func New(st *store.Store, hub *sse.Hub) *Widget { return &Widget{store: st, hub: hub} }

func (w *Widget) ID() string         { return "chores" }
func (w *Widget) Jobs() []widget.Job { return nil }

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/chores", w.handleList)
	mux.HandleFunc("POST /api/widgets/chores", w.handleCreate)
	mux.HandleFunc("POST /api/widgets/chores/{id}/complete", w.handleComplete)
	mux.HandleFunc("DELETE /api/widgets/chores/{id}", w.handleDelete)
}

// choreView adds the due math the kiosk needs: dueOn and days until/overdue.
type choreView struct {
	store.Chore
	DueOn     string `json:"dueOn"` // YYYY-MM-DD
	DueIn     int    `json:"dueIn"` // days; negative = overdue
	NeverDone bool   `json:"neverDone"`
}

func (w *Widget) handleList(rw http.ResponseWriter, r *http.Request) {
	chores, err := w.store.ListChores()
	if err != nil {
		writeErr(rw, err)
		return
	}
	today := time.Now()
	todayStr := today.Format("2006-01-02")
	views := make([]choreView, 0, len(chores))
	for _, c := range chores {
		v := choreView{Chore: c}
		if c.LastDone == "" {
			// Never done: due today.
			v.DueOn = todayStr
			v.DueIn = 0
			v.NeverDone = true
		} else {
			last, err := time.Parse("2006-01-02", c.LastDone)
			if err != nil {
				last = today
			}
			due := last.AddDate(0, 0, c.EveryDays)
			v.DueOn = due.Format("2006-01-02")
			v.DueIn = int(due.Sub(today).Hours() / 24)
			if due.Format("2006-01-02") == todayStr {
				v.DueIn = 0
			}
		}
		views = append(views, v)
	}
	writeJSON(rw, http.StatusOK, views)
}

func (w *Widget) handleCreate(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Title     string `json:"title"`
		EveryDays int    `json:"everyDays"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Title) == "" {
		badRequest(rw, "title is required")
		return
	}
	if req.EveryDays < 1 {
		badRequest(rw, "everyDays must be at least 1")
		return
	}
	chore, err := w.store.CreateChore(strings.TrimSpace(req.Title), req.EveryDays)
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("chores", "changed")
	writeJSON(rw, http.StatusCreated, chore)
}

func (w *Widget) handleComplete(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	if err := w.store.CompleteChore(id, time.Now().Format("2006-01-02")); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("chores", "changed")
	writeJSON(rw, http.StatusOK, map[string]string{"status": "done"})
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteChore(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.hub.Publish("chores", "changed")
	rw.WriteHeader(http.StatusNoContent)
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
	slog.Error("chores request failed", "err", err)
	writeJSON(rw, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}

func badRequest(rw http.ResponseWriter, msg string) {
	writeJSON(rw, http.StatusBadRequest, map[string]string{"error": msg})
}
