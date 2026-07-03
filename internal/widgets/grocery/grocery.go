// Package grocery: the shared shopping list. The most realtime-sensitive
// widget — additions from a phone should appear on the kiosk instantly.
package grocery

import (
	"net/http"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

type Widget struct {
	widget.Base
	store *store.Store
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{Base: widget.Base{Hub: hub, Slug: topics.Grocery}, store: st}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/grocery", w.handleList)
	mux.HandleFunc("POST /api/widgets/grocery", w.handleAdd)
	mux.HandleFunc("POST /api/widgets/grocery/{id}/toggle", w.handleToggle)
	mux.HandleFunc("POST /api/widgets/grocery/clear-checked", w.handleClearChecked)
	mux.HandleFunc("DELETE /api/widgets/grocery/{id}", w.handleDelete)
}

func (w *Widget) handleList(rw http.ResponseWriter, r *http.Request) {
	items, err := w.store.ListGroceryItems()
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	httpx.JSON(rw, http.StatusOK, items)
}

func (w *Widget) handleAdd(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !httpx.Decode(rw, r, &req) {
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httpx.BadRequest(rw, "name is required")
		return
	}
	item, err := w.store.AddGroceryItem(strings.TrimSpace(req.Name))
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Changed(rw, http.StatusCreated, item)
}

func (w *Widget) handleToggle(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(rw, r)
	if !ok {
		return
	}
	if err := w.store.ToggleGroceryItem(id); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Changed(rw, http.StatusOK, map[string]string{"status": "toggled"})
}

func (w *Widget) handleClearChecked(rw http.ResponseWriter, r *http.Request) {
	if err := w.store.ClearCheckedGroceryItems(); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Changed(rw, http.StatusOK, map[string]string{"status": "cleared"})
}

func (w *Widget) handleDelete(rw http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(rw, r)
	if !ok {
		return
	}
	if err := w.store.DeleteGroceryItem(id); err != nil {
		httpx.Fail(rw, err)
		return
	}
	w.Changed(rw, http.StatusNoContent, nil)
}
