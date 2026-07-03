// Package server assembles the HTTP API: platform routes (views, SSE
// stream), widget routes via the registry, and the embedded SPA.
package server

import (
	"errors"
	"io/fs"
	"net/http"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

type Server struct {
	store *store.Store
	hub   *sse.Hub
	reg   *widget.Registry
	mux   *http.ServeMux
}

func New(st *store.Store, hub *sse.Hub, reg *widget.Registry, dist fs.FS) *Server {
	s := &Server{store: st, hub: hub, reg: reg, mux: http.NewServeMux()}

	s.mux.HandleFunc("GET /api/healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/widgets", s.handleListWidgets)
	s.mux.Handle("GET /api/stream", hub)

	s.mux.HandleFunc("GET /api/views", s.handleListViews)
	s.mux.HandleFunc("POST /api/views", s.handleCreateView)
	s.mux.HandleFunc("PUT /api/views/{id}", s.handleUpdateView)
	s.mux.HandleFunc("DELETE /api/views/{id}", s.handleDeleteView)
	s.mux.HandleFunc("POST /api/views/{id}/default", s.handleSetDefaultView)
	s.mux.HandleFunc("POST /api/views/{id}/guest", s.handleSetGuestView)

	s.mux.HandleFunc("GET /api/guest", s.handleGuestConfig)
	s.mux.HandleFunc("POST /api/guest/pin", s.handleSetGuestPin)
	s.mux.HandleFunc("POST /api/guest/verify", s.handleVerifyGuestPin)

	s.mux.HandleFunc("GET /api/night", s.handleGetNight)
	s.mux.HandleFunc("PUT /api/night", s.handleSetNight)

	s.mux.HandleFunc("GET /api/backup", s.handleDownloadBackup)

	s.mux.HandleFunc("GET /api/profiles", s.handleListProfiles)
	s.mux.HandleFunc("POST /api/profiles", s.handleCreateProfile)
	s.mux.HandleFunc("PUT /api/profiles/{id}", s.handleUpdateProfile)
	s.mux.HandleFunc("DELETE /api/profiles/{id}", s.handleDeleteProfile)

	reg.Mount(s.mux)

	s.mux.Handle("/", spaHandler(dist))
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// changed is the platform counterpart of widget.Base.Changed: it publishes
// "changed" on the given topic, then writes the response. Every mutating
// platform handler ends here so publish-on-write can't be forgotten. A nil
// v writes only the status (for 204 No Content).
func (s *Server) changed(w http.ResponseWriter, topic string, status int, v any) {
	s.hub.Publish(topic, "changed")
	if v == nil {
		w.WriteHeader(status)
		return
	}
	httpx.JSON(w, status, v)
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleListWidgets(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, s.reg.IDs())
}

func (s *Server) handleListViews(w http.ResponseWriter, r *http.Request) {
	views, err := s.store.ListViews()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, views)
}

type viewRequest struct {
	Name   string             `json:"name"`
	Layout []store.LayoutItem `json:"layout"`
}

func decodeViewRequest(w http.ResponseWriter, r *http.Request) (viewRequest, bool) {
	var req viewRequest
	if !httpx.Decode(w, r, &req) {
		return req, false
	}
	if strings.TrimSpace(req.Name) == "" {
		httpx.BadRequest(w, "name is required")
		return req, false
	}
	if req.Layout == nil {
		req.Layout = []store.LayoutItem{}
	}
	return req, true
}

func (s *Server) handleCreateView(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeViewRequest(w, r)
	if !ok {
		return
	}
	view, err := s.store.CreateView(req.Name, req.Layout)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusCreated, view)
}

func (s *Server) handleUpdateView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	req, ok := decodeViewRequest(w, r)
	if !ok {
		return
	}
	view, err := s.store.UpdateView(id, req.Name, req.Layout)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusOK, view)
}

func (s *Server) handleDeleteView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	if err := s.store.DeleteView(id); err != nil {
		if errors.Is(err, store.ErrLastView) {
			httpx.BadRequest(w, "a board needs at least one view")
			return
		}
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusNoContent, nil)
}

func (s *Server) handleSetDefaultView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	if err := s.store.SetDefaultView(id); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusNoContent, nil)
}

// spaHandler serves the embedded frontend build, falling back to index.html
// for client-side routes. If the frontend hasn't been built into the binary
// it says so instead of returning a bare 404.
//
// Cache policy matters here: embedded files have no modtime, so without
// explicit headers browsers cache index.html heuristically and can serve a
// stale app for days after a rebuild. Hashed assets are immutable; the HTML
// shell must always revalidate.
func spaHandler(dist fs.FS) http.Handler {
	fileServer := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(dist, path); err == nil {
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		index, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			http.Error(w, "frontend not built — run `make web` and rebuild", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(index)
	})
}
