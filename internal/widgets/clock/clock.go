// Package clock is the reference widget: the smallest possible
// implementation of the widget contract, proving routes + jobs + SSE
// end to end.
package clock

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/widget"
)

type Clock struct {
	hub *sse.Hub
}

func New(hub *sse.Hub) *Clock { return &Clock{hub: hub} }

func (c *Clock) ID() string { return "clock" }

func (c *Clock) payload() map[string]any {
	now := time.Now()
	zone, _ := now.Zone()
	return map[string]any{"now": now.Format(time.RFC3339), "zone": zone}
}

func (c *Clock) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/clock/now", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(c.payload())
	})
}

func (c *Clock) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "tick",
		Interval: 30 * time.Second,
		Run: func(ctx context.Context) error {
			c.hub.Publish("clock", c.payload())
			return nil
		},
	}}
}
