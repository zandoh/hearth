package server

import (
	"encoding/json"
	"net/http"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
)

// First-boot onboarding: a pristine install (the untouched seed view and no
// prior choice) offers starter templates; picking one writes a real layout
// into the Home view so a new household starts from something, not a blank
// grid. Applying — or explicitly skipping — is remembered server-side, so
// every screen agrees the question was answered.

var onboardedSetting = store.Setting[bool]{Key: "onboarded"}

var templates = map[string][]store.LayoutItem{
	// The kitchen-sink family board: calendar front and center.
	"family": {
		{I: "clock-1", Widget: "clock", X: 0, Y: 0, W: 3, H: 3, Config: json.RawMessage(`{}`)},
		{I: "calendar-1", Widget: "calendar", X: 3, Y: 0, W: 6, H: 8, Config: json.RawMessage(`{}`)},
		{I: "agenda-1", Widget: "agenda", X: 9, Y: 0, W: 3, H: 4, Config: json.RawMessage(`{}`)},
		{I: "chores-1", Widget: "chores", X: 0, Y: 3, W: 3, H: 5, Config: json.RawMessage(`{}`)},
		{I: "weather-1", Widget: "weather", X: 9, Y: 4, W: 3, H: 4, Config: json.RawMessage(`{}`)},
		{I: "grocery-1", Widget: "grocery", X: 0, Y: 8, W: 4, H: 4, Config: json.RawMessage(`{}`)},
		{I: "meds-1", Widget: "meds", X: 4, Y: 8, W: 4, H: 4, Config: json.RawMessage(`{}`)},
		{I: "countdown-1", Widget: "countdown", X: 8, Y: 8, W: 4, H: 4, Config: json.RawMessage(`{}`)},
	},
	// Meal planning and groceries lead; for the screen by the fridge.
	"kitchen": {
		{I: "mealplan-1", Widget: "mealplan", X: 0, Y: 0, W: 6, H: 6, Config: json.RawMessage(`{}`)},
		{I: "grocery-1", Widget: "grocery", X: 6, Y: 0, W: 3, H: 6, Config: json.RawMessage(`{}`)},
		{I: "clock-1", Widget: "clock", X: 9, Y: 0, W: 3, H: 3, Config: json.RawMessage(`{}`)},
		{I: "weather-1", Widget: "weather", X: 9, Y: 3, W: 3, H: 5, Config: json.RawMessage(`{}`)},
		{I: "chores-1", Widget: "chores", X: 0, Y: 6, W: 4, H: 4, Config: json.RawMessage(`{}`)},
		{I: "countdown-1", Widget: "countdown", X: 4, Y: 6, W: 3, H: 4, Config: json.RawMessage(`{}`)},
	},
	// A calm glanceable wall: time, sky, what's next.
	"simple": {
		{I: "clock-1", Widget: "clock", X: 0, Y: 0, W: 4, H: 4, Config: json.RawMessage(`{}`)},
		{I: "weather-1", Widget: "weather", X: 4, Y: 0, W: 4, H: 4, Config: json.RawMessage(`{}`)},
		{I: "agenda-1", Widget: "agenda", X: 8, Y: 0, W: 4, H: 6, Config: json.RawMessage(`{}`)},
	},
	// Keep the blank board; just stop asking.
	"scratch": nil,
}

// pristine reports whether this install is untouched: one view, still
// carrying exactly the migration seed (a single clock).
func (s *Server) pristine() (bool, error) {
	views, err := s.store.ListViews()
	if err != nil {
		return false, err
	}
	if len(views) != 1 || len(views[0].Layout) != 1 {
		return false, nil
	}
	return views[0].Layout[0].I == "clock-1", nil
}

func (s *Server) handleGetOnboarding(w http.ResponseWriter, r *http.Request) {
	if answered, ok, err := onboardedSetting.Get(s.store); err == nil && ok && answered {
		httpx.JSON(w, http.StatusOK, map[string]bool{"needed": false})
		return
	}
	fresh, err := s.pristine()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"needed": fresh})
}

func (s *Server) handleApplyTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Template string `json:"template"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	layout, known := templates[req.Template]
	if !known {
		httpx.BadRequest(w, "unknown template")
		return
	}
	if layout != nil {
		views, err := s.store.ListViews()
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		home := views[0]
		if _, err := s.store.UpdateView(home.ID, home.Name, layout); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	if err := onboardedSetting.Set(s.store, true); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusOK, map[string]bool{"needed": false})
}
