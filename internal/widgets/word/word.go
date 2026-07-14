// Package word: a word of the day from a pack embedded in the binary — no
// upstream API, no configuration. The word is a pure function of the local
// date, so every screen in the house shows the same word and it survives
// restarts without state. An hourly job publishes when the date flips so
// boards that dodge the nightly reload still turn over at midnight.
package word

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

// entry is one pack word; the JSON shape is the API response minus the day.
type entry struct {
	Word       string `json:"word"`
	POS        string `json:"pos"` // part of speech, e.g. "noun"
	Definition string `json:"definition"`
	Example    string `json:"example"`
}

type Widget struct {
	widget.Base
	now func() time.Time // time.Now; injectable for rollover tests

	mu        sync.Mutex
	published string // last day a rollover was announced for
}

func New(hub *sse.Hub) *Widget {
	return &Widget{
		Base: widget.Base{Hub: hub, Slug: topics.Word},
		now:  time.Now,
	}
}

// wordFor picks the day's word: days since a fixed epoch, modulo the pack.
// Local time on purpose — the word should flip at the household's midnight.
func wordFor(day time.Time) entry {
	epoch := time.Date(2020, time.January, 1, 0, 0, 0, 0, day.Location())
	days := int(day.Sub(epoch).Hours() / 24)
	return pack[((days%len(pack))+len(pack))%len(pack)]
}

func (w *Widget) payload() map[string]any {
	now := w.now()
	e := wordFor(now)
	return map[string]any{
		"day":        now.Format("2006-01-02"),
		"word":       e.Word,
		"pos":        e.POS,
		"definition": e.Definition,
		"example":    e.Example,
	}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/word/today", func(rw http.ResponseWriter, r *http.Request) {
		httpx.JSON(rw, http.StatusOK, w.payload())
	})
}

// Jobs: no fetching to do — the only background work is announcing the
// midnight rollover so open boards re-fetch.
func (w *Widget) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "rollover",
		Interval: time.Hour,
		Run: func(ctx context.Context) error {
			day := w.now().Format("2006-01-02")
			w.mu.Lock()
			flipped := w.published != "" && w.published != day
			w.published = day
			w.mu.Unlock()
			if flipped {
				w.Publish("changed")
			}
			return nil
		},
	}}
}
