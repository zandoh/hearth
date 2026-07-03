// Package guestbook: sticky notes guests leave on the guest view.
package guestbook

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

var noteColors = map[string]bool{
	"yellow": true, "pink": true, "blue": true, "green": true,
}

type Widget struct {
	widget.Base
	store *store.Store
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{Base: widget.Base{Hub: hub, Slug: "guestbook"}, store: st}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/guestbook", w.handleList)
	mux.HandleFunc("POST /api/widgets/guestbook", w.handleAdd)
	mux.HandleFunc("DELETE /api/widgets/guestbook/{id}", w.handleDelete)
	mux.HandleFunc("PUT /api/widgets/guestbook/{id}/position", w.handleMove)
}

// handleMove pins a note somewhere on the wall. Coordinates are fractions
// of the wall (top-left of the note), clamped server-side so a buggy or
// hostile client can't park notes off-canvas for everyone.
func (w *Widget) handleMove(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	var req struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.BadRequest(rw, "invalid JSON body")
		return
	}
	clamp := func(v float64) float64 { return min(max(v, 0), 1) }
	if err := w.store.SetGuestbookNotePosition(id, clamp(req.X), clamp(req.Y)); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	rw.WriteHeader(http.StatusNoContent)
}

func (w *Widget) handleList(rw http.ResponseWriter, r *http.Request) {
	notes, err := w.store.ListGuestbookNotes()
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	httpx.JSON(rw, http.StatusOK, notes)
}

func (w *Widget) handleAdd(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Author  string `json:"author"`
		Message string `json:"message"`
		Color   string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Message) == "" {
		httpx.BadRequest(rw, "message is required")
		return
	}
	// Runes, not bytes: the client counts characters, and an emoji-heavy
	// note shouldn't be rejected while its counter still reads under 280.
	if utf8.RuneCountInString(req.Message) > 280 {
		httpx.BadRequest(rw, "keep notes under 280 characters")
		return
	}
	if !noteColors[req.Color] {
		req.Color = "yellow"
	}
	note, err := w.store.AddGuestbookNote(
		strings.TrimSpace(req.Author), strings.TrimSpace(req.Message), req.Color)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	httpx.JSON(rw, http.StatusCreated, note)
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteGuestbookNote(id); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Publish("changed")
	rw.WriteHeader(http.StatusNoContent)
}
