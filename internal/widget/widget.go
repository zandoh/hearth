// Package widget defines the contract every Hearth widget implements and
// the registry that wires widgets into the server. Adding a widget means
// implementing Widget and adding one Register call in main.
package widget

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
)

// Job is a recurring background task owned by a widget, e.g. "sync Google
// Calendar every 5 minutes" or "refresh weather".
type Job struct {
	Name     string
	Interval time.Duration
	Run      func(ctx context.Context) error
}

type Widget interface {
	// ID is the widget's unique slug, used in URLs and layout entries.
	ID() string
	// Routes registers the widget's API handlers. Handlers must be
	// registered under /api/widgets/{id}/.
	Routes(mux *http.ServeMux)
	// Jobs returns recurring background tasks; may be empty.
	Jobs() []Job
}

// Base carries the wiring every widget shares and owns the SSE topic
// convention: a widget publishes on its own ID, so the topic string has
// exactly one source. Embed it and override Jobs when the widget has
// background work.
type Base struct {
	Hub  *sse.Hub
	Slug string
}

func (b Base) ID() string  { return b.Slug }
func (b Base) Jobs() []Job { return nil }

// Publish sends data to the widget's SSE topic (its ID).
func (b Base) Publish(data any) { b.Hub.Publish(b.Slug, data) }

// Changed is the canonical end of every mutating widget handler: it
// publishes "changed" on the widget's own topic, then writes the JSON
// response. Ending handlers with Changed makes publish-on-write
// unforgettable. A nil v writes only the status (for 204 No Content).
func (b Base) Changed(rw http.ResponseWriter, status int, v any) {
	b.Publish("changed")
	if v == nil {
		rw.WriteHeader(status)
		return
	}
	httpx.JSON(rw, status, v)
}

type Registry struct {
	widgets []Widget
}

func NewRegistry() *Registry { return &Registry{} }

func (r *Registry) Register(w Widget) {
	r.widgets = append(r.widgets, w)
}

func (r *Registry) IDs() []string {
	ids := make([]string, len(r.widgets))
	for i, w := range r.widgets {
		ids[i] = w.ID()
	}
	return ids
}

func (r *Registry) Mount(mux *http.ServeMux) {
	for _, w := range r.widgets {
		w.Routes(mux)
	}
}

// StartJobs runs every widget job on its interval until ctx is cancelled.
// Each job also runs once at startup so widgets have fresh data immediately.
func (r *Registry) StartJobs(ctx context.Context) {
	for _, w := range r.widgets {
		for _, job := range w.Jobs() {
			go func(id string, j Job) {
				run := func() {
					if err := j.Run(ctx); err != nil {
						slog.Error("widget job failed", "widget", id, "job", j.Name, "err", err)
					}
				}
				run()
				ticker := time.NewTicker(j.Interval)
				defer ticker.Stop()
				for {
					select {
					case <-ctx.Done():
						return
					case <-ticker.C:
						run()
					}
				}
			}(w.ID(), job)
		}
	}
}
