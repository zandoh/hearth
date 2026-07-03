// Package clock is the reference widget: the smallest possible
// implementation of the widget contract, proving routes + jobs + SSE
// end to end.
package clock

import (
	"context"
	"net/http"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/widget"
)

type Clock struct {
	widget.Base
}

func New(hub *sse.Hub) *Clock {
	return &Clock{Base: widget.Base{Hub: hub, Slug: "clock"}}
}

func (c *Clock) payload() map[string]any {
	now := time.Now()
	zone, _ := now.Zone()
	return map[string]any{"now": now.Format(time.RFC3339), "zone": zone}
}

func (c *Clock) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/clock/now", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, http.StatusOK, c.payload())
	})
}

func (c *Clock) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "tick",
		Interval: 30 * time.Second,
		Run: func(ctx context.Context) error {
			c.Publish(c.payload())
			return nil
		},
	}}
}
