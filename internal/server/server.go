// Package server assembles the HTTP API: platform routes (views, profiles,
// SSE stream), widget routes via the registry, and the embedded SPA.
package server

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
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

	s.mux.HandleFunc("GET /api/profiles", s.handleListProfiles)
	s.mux.HandleFunc("POST /api/profiles", s.handleCreateProfile)

	reg.Mount(s.mux)

	s.mux.Handle("/", spaHandler(dist))
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.BadRequest(w, "invalid JSON body")
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
	s.hub.Publish("views", "changed")
	httpx.JSON(w, http.StatusCreated, view)
}

func (s *Server) handleUpdateView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(w, "invalid id")
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
	s.hub.Publish("views", "changed")
	httpx.JSON(w, http.StatusOK, view)
}

func (s *Server) handleDeleteView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(w, "invalid id")
		return
	}
	if err := s.store.DeleteView(id); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.hub.Publish("views", "changed")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.store.ListProfiles()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, profiles)
}

func (s *Server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		httpx.BadRequest(w, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#7a7a7a"
	}
	profile, err := s.store.CreateProfile(req.Name, req.Color)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, profile)
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
