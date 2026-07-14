// Package news: headlines for one Google News topic per widget instance,
// from the keyless RSS feeds. Topic choice lives in each widget instance's
// layout config, so like sports there is no global setting: the backend
// caches per topic on demand. A topic's first request registers it and
// answers {pending:true}; the refresh job keeps requested topics fresh and
// stops polling topics nobody has asked about for a while. The kiosk is
// always served from memory.
package news

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

const (
	tickEvery    = 5 * time.Minute
	refreshAfter = 15 * time.Minute
	evictAfter   = 2 * time.Hour
)

// entry is one tracked topic's cached state. Its items slice is treated as
// immutable: updates swap in a fresh slice, so handlers can encode a
// snapshot safely.
type entry struct {
	lastRequested time.Time
	fetchedAt     time.Time // zero until the first fetch lands
	fetching      bool      // an on-demand fetch goroutine is in flight
	items         []headline
}

// topicHeadlines is the shape served to the frontend.
type topicHeadlines struct {
	Topic     string     `json:"topic"`
	FetchedAt time.Time  `json:"fetchedAt"`
	Items     []headline `json:"items"`
}

type Widget struct {
	widget.Base
	api feedAPI
	now func() time.Time // time.Now; injectable for cadence/eviction tests

	mu    sync.Mutex
	cache map[string]*entry
}

func New(hub *sse.Hub) *Widget {
	return &Widget{
		Base:  widget.Base{Hub: hub, Slug: topics.News},
		api:   &googleNewsClient{http: &http.Client{Timeout: 20 * time.Second}},
		now:   time.Now,
		cache: map[string]*entry{},
	}
}

func (w *Widget) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "refresh",
		Interval: tickEvery,
		Run:      w.refresh,
	}}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/news/headlines", w.handleHeadlines)
}

// handleHeadlines serves one topic's headlines from cache. A first request
// for an unknown topic registers it, answers {pending:true}, and fetches in
// the background; the completed fetch announces itself over SSE and the
// widget re-requests. Every request bumps the topic's keep-alive.
func (w *Widget) handleHeadlines(rw http.ResponseWriter, r *http.Request) {
	topic := r.URL.Query().Get("topic")
	if _, ok := sections[topic]; !ok {
		httpx.BadRequest(rw, "unknown topic")
		return
	}
	now := w.now()

	w.mu.Lock()
	e := w.cache[topic]
	if e == nil {
		e = &entry{}
		w.cache[topic] = e
	}
	e.lastRequested = now
	if e.fetchedAt.IsZero() {
		if !e.fetching {
			e.fetching = true
			// Detached from the request context: the fetch must outlive
			// the client, and completion is announced over SSE.
			go w.fetchAndPublish(topic)
		}
		w.mu.Unlock()
		httpx.JSON(rw, http.StatusOK, map[string]any{"pending": true})
		return
	}
	res := topicHeadlines{Topic: topic, FetchedAt: e.fetchedAt, Items: e.items}
	w.mu.Unlock()
	httpx.JSON(rw, http.StatusOK, map[string]any{"headlines": res})
}

// refresh evicts topics nobody is requesting and refetches the rest once
// their cache passes refreshAfter.
func (w *Widget) refresh(ctx context.Context) error {
	now := w.now()
	var stale []string
	w.mu.Lock()
	for topic, e := range w.cache {
		if now.Sub(e.lastRequested) > evictAfter {
			delete(w.cache, topic)
			continue
		}
		if !e.fetching && now.Sub(e.fetchedAt) >= refreshAfter {
			stale = append(stale, topic)
		}
	}
	w.mu.Unlock()

	var errs []error
	changed := false
	for _, topic := range stale {
		if err := w.fetchTopic(ctx, topic); err != nil {
			errs = append(errs, err)
		} else {
			changed = true
		}
	}
	if changed {
		w.Publish("changed")
	}
	return errors.Join(errs...)
}

// fetchAndPublish is the on-demand path behind {pending:true} responses.
func (w *Widget) fetchAndPublish(topic string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := w.fetchTopic(ctx, topic); err != nil {
		slog.Warn("news: fetch failed", "topic", topic, "err", err)
		return
	}
	w.Publish("changed")
}

// fetchTopic refreshes one topic. On failure the entry keeps its last good
// items; the error is logged by the caller or job runner.
func (w *Widget) fetchTopic(ctx context.Context, topic string) error {
	items, err := w.api.headlines(ctx, topic)
	w.mu.Lock()
	defer w.mu.Unlock()
	e := w.cache[topic]
	if e == nil {
		return err // evicted while fetching
	}
	e.fetching = false
	if err != nil {
		return err
	}
	e.items = items
	e.fetchedAt = w.now()
	return nil
}
