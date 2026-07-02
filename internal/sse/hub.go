// Package sse implements a Server-Sent Events hub. Widgets publish to
// topics; every connected client receives every event and filters by topic.
package sse

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
)

type envelope struct {
	Topic string `json:"topic"`
	Data  any    `json:"data"`
}

type Hub struct {
	mu   sync.Mutex
	subs map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[chan []byte]struct{})}
}

// Publish sends data to all connected clients under the given topic.
// Slow clients that can't keep up are skipped, never blocked on.
func (h *Hub) Publish(topic string, data any) {
	b, err := json.Marshal(envelope{Topic: topic, Data: data})
	if err != nil {
		slog.Error("sse: marshal event", "topic", topic, "err", err)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- b:
		default:
		}
	}
}

func (h *Hub) subscribe() chan []byte {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) unsubscribe(ch chan []byte) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

// ServeHTTP streams events to one client until it disconnects.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := h.subscribe()
	defer h.unsubscribe(ch)

	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}
