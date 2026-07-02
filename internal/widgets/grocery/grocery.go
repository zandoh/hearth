// Package grocery: the shared shopping list. The most realtime-sensitive
// widget — additions from a phone should appear on the kiosk instantly.
package grocery

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

type Widget struct {
	store *store.Store
	hub   *sse.Hub
}

func New(st *store.Store, hub *sse.Hub) *Widget { return &Widget{store: st, hub: hub} }

func (w *Widget) ID() string         { return "grocery" }
func (w *Widget) Jobs() []widget.Job { return nil }

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/grocery", w.handleList)
	mux.HandleFunc("POST /api/widgets/grocery", w.handleAdd)
	mux.HandleFunc("POST /api/widgets/grocery/{id}/toggle", w.handleToggle)
	mux.HandleFunc("POST /api/widgets/grocery/clear-checked", w.handleClearChecked)
	mux.HandleFunc("DELETE /api/widgets/grocery/{id}", w.handleDelete)
}

func (w *Widget) publish() { w.hub.Publish("grocery", "changed") }

func (w *Widget) handleList(rw http.ResponseWriter, r *http.Request) {
	items, err := w.store.ListGroceryItems()
	if err != nil {
		writeErr(rw, err)
		return
	}
	writeJSON(rw, http.StatusOK, items)
}

func (w *Widget) handleAdd(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.Name) == "" {
		badRequest(rw, "name is required")
		return
	}
	item, err := w.store.AddGroceryItem(strings.TrimSpace(req.Name))
	if err != nil {
		writeErr(rw, err)
		return
	}
	w.publish()
	writeJSON(rw, http.StatusCreated, item)
}

func (w *Widget) handleToggle(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	if err := w.store.ToggleGroceryItem(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.publish()
	writeJSON(rw, http.StatusOK, map[string]string{"status": "toggled"})
}

func (w *Widget) handleClearChecked(rw http.ResponseWriter, r *http.Request) {
	if err := w.store.ClearCheckedGroceryItems(); err != nil {
		writeErr(rw, err)
		return
	}
	w.publish()
	writeJSON(rw, http.StatusOK, map[string]string{"status": "cleared"})
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		badRequest(rw, "invalid id")
		return
	}
	if err := w.store.DeleteGroceryItem(id); err != nil {
		writeErr(rw, err)
		return
	}
	w.publish()
	rw.WriteHeader(http.StatusNoContent)
}

func writeJSON(rw http.ResponseWriter, status int, v any) {
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	json.NewEncoder(rw).Encode(v)
}

func writeErr(rw http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(rw, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	slog.Error("grocery request failed", "err", err)
	writeJSON(rw, http.StatusInternalServerError, map[string]string{"error": "internal error"})
}

func badRequest(rw http.ResponseWriter, msg string) {
	writeJSON(rw, http.StatusBadRequest, map[string]string{"error": msg})
}
