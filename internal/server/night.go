package server

import (
	"net/http"
	"regexp"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
)

// Night dimming: in a household-set quiet window, the kiosk shows a dark shade over
// the board. The window is in settings, so every device dims together. The shade is
// client-side.

type nightConfig struct {
	Enabled bool    `json:"enabled"`
	Start   string  `json:"start"` // HH:MM local
	End     string  `json:"end"`   // HH:MM local; may cross midnight
	Level   float64 `json:"level"` // shade opacity, 0.2–0.85
}

var nightSetting = store.Setting[nightConfig]{Key: "night_dim"}

func defaultNight() nightConfig {
	return nightConfig{Enabled: false, Start: "22:00", End: "07:00", Level: 0.6}
}

var hhmmRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

func (s *Server) handleGetNight(w http.ResponseWriter, r *http.Request) {
	cfg := defaultNight()
	if stored, ok, err := nightSetting.Get(s.store); err == nil && ok {
		cfg = stored
	}
	httpx.JSON(w, http.StatusOK, cfg)
}

func (s *Server) handleSetNight(w http.ResponseWriter, r *http.Request) {
	var cfg nightConfig
	if !httpx.Decode(w, r, &cfg) {
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
	if err := nightSetting.Set(s.store, cfg); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Night, http.StatusOK, cfg)
}
