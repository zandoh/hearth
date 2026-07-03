package server

import (
	"encoding/json"
	"net/http"
	"regexp"

	"github.com/zandoh/hearth/internal/httpx"
)

// Night dimming: during a household-configured quiet window the kiosk pulls
// a dark shade over the board. The window lives in settings so every device
// on the wall dims together; the shade itself is client-side.

const nightSetting = "night_dim"

type nightConfig struct {
	Enabled bool    `json:"enabled"`
	Start   string  `json:"start"` // HH:MM local
	End     string  `json:"end"`   // HH:MM local; may cross midnight
	Level   float64 `json:"level"` // shade opacity, 0.2–0.85
}

func defaultNight() nightConfig {
	return nightConfig{Enabled: false, Start: "22:00", End: "07:00", Level: 0.6}
}

var hhmmRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

func (s *Server) handleGetNight(w http.ResponseWriter, r *http.Request) {
	cfg := defaultNight()
	if raw, err := s.store.GetSetting(nightSetting); err == nil {
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			cfg = defaultNight()
		}
	}
	httpx.JSON(w, http.StatusOK, cfg)
}

func (s *Server) handleSetNight(w http.ResponseWriter, r *http.Request) {
	var cfg nightConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		httpx.BadRequest(w, "invalid JSON body")
		return
	}
	if !hhmmRe.MatchString(cfg.Start) || !hhmmRe.MatchString(cfg.End) {
		httpx.BadRequest(w, "start and end must be HH:MM")
		return
	}
	if cfg.Level < 0.2 || cfg.Level > 0.85 {
		httpx.BadRequest(w, "level must be between 0.2 and 0.85")
		return
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := s.store.SetSetting(nightSetting, string(raw)); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.hub.Publish("night", "changed")
	httpx.JSON(w, http.StatusOK, cfg)
}
