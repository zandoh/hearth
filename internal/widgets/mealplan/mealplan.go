// Package mealplan: the household's week of breakfasts, lunches, and
// dinners — every slot optional.
package mealplan

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

var (
	dayRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	slots = map[string]bool{"breakfast": true, "lunch": true, "dinner": true}
)

type Widget struct {
	widget.Base
	store *store.Store
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{Base: widget.Base{Hub: hub, Slug: topics.MealPlan}, store: st}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/mealplan/week", w.handleWeek)
	mux.HandleFunc("PUT /api/widgets/mealplan/entry", w.handleSetEntry)
}

// handleWeek returns the 7 days starting at ?start (a Sunday, matching the
// calendar's week convention), defaulting to the current week.
func (w *Widget) handleWeek(rw http.ResponseWriter, r *http.Request) {
	start := r.URL.Query().Get("start")
	if start == "" {
		now := time.Now()
		start = now.AddDate(0, 0, -int(now.Weekday())).Format("2006-01-02")
	}
	if !dayRe.MatchString(start) {
		httpx.BadRequest(rw, "start must be YYYY-MM-DD")
		return
	}
	first, err := time.Parse("2006-01-02", start)
	if err != nil {
		httpx.BadRequest(rw, "start must be a valid date")
		return
	}
	end := first.AddDate(0, 0, 6).Format("2006-01-02")
	entries, err := w.store.MealEntriesBetween(start, end)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	httpx.JSON(rw, http.StatusOK, map[string]any{"start": start, "entries": entries})
}

func (w *Widget) handleSetEntry(rw http.ResponseWriter, r *http.Request) {
	var req store.MealEntry
	if !httpx.Decode(rw, r, &req) {
		return
	}
	if !dayRe.MatchString(req.Day) || !slots[req.Slot] {
		httpx.BadRequest(rw, "day (YYYY-MM-DD) and slot (breakfast|lunch|dinner) are required")
		return
	}
	if err := w.store.SetMealEntry(req.Day, req.Slot, strings.TrimSpace(req.Text)); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Changed(rw, http.StatusOK, map[string]string{"status": "saved"})
}
