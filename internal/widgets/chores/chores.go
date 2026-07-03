// Package chores: recurring household tasks on simple "every N days"
// intervals, with a tap-to-complete log.
package chores

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

type Widget struct {
	widget.Base
	store *store.Store
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{Base: widget.Base{Hub: hub, Slug: "chores"}, store: st}
}

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

// dueView computes a chore's due state as of now: never-done chores are due
// today; otherwise due lastDone + everyDays, with dueIn counted in whole
// days and clamped to 0 when the due date is today.
func dueView(c store.Chore, now time.Time) choreView {
	v := choreView{Chore: c}
	today := now.Format("2006-01-02")
	if c.LastDone == "" {
		v.DueOn = today
		v.NeverDone = true
		return v
	}
	last, err := time.Parse("2006-01-02", c.LastDone)
	if err != nil {
		last = now
	}
	due := last.AddDate(0, 0, c.EveryDays)
	v.DueOn = due.Format("2006-01-02")
	v.DueIn = int(due.Sub(now).Hours() / 24)
	if v.DueOn == today {
		v.DueIn = 0
	}
	return v
}

func (w *Widget) handleList(rw http.ResponseWriter, r *http.Request) {
	chores, err := w.store.ListChores()
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	now := time.Now()
	views := make([]choreView, 0, len(chores))
	for _, c := range chores {
		views = append(views, dueView(c, now))
	}
	httpx.JSON(rw, http.StatusOK, views)
}

func (w *Widget) handleCreate(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Title     string `json:"title"`
		EveryDays int    `json:"everyDays"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Title) == "" {
		httpx.BadRequest(rw, "title is required")
		return
	}
	if req.EveryDays < 1 {
		httpx.BadRequest(rw, "everyDays must be at least 1")
		return
	}
	chore, err := w.store.CreateChore(strings.TrimSpace(req.Title), req.EveryDays)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	httpx.JSON(rw, http.StatusCreated, chore)
}

func (w *Widget) handleComplete(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	if err := w.store.CompleteChore(id, time.Now().Format("2006-01-02")); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	httpx.JSON(rw, http.StatusOK, map[string]string{"status": "done"})
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteChore(id); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	rw.WriteHeader(http.StatusNoContent)
}
