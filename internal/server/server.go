// Package server assembles the HTTP API: platform routes (views, SSE
// stream), widget routes via the registry, and the embedded SPA.
package server

import (
	"errors"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

type Server struct {
	store   *store.Store
	hub     *sse.Hub
	reg     *widget.Registry
	mux     *http.ServeMux
	allowed map[string]bool
}

// allowedHosts returns the set of extra hostnames permitted beyond the
// built-in localhost / private-IP / .local defaults: the host of
// HEARTH_BASE_URL plus any comma-separated HEARTH_ALLOWED_HOSTS. This is the
// reverse-proxy escape hatch — a proxy that presents a public hostname must
// list it here.
func allowedHosts() map[string]bool {
	set := map[string]bool{}
	add := func(h string) {
		h = strings.ToLower(strings.TrimSpace(h))
		if h != "" {
			set[h] = true
		}
	}
	if base := os.Getenv("HEARTH_BASE_URL"); base != "" {
		if u, err := url.Parse(base); err == nil && u.Host != "" {
			add(u.Hostname())
		}
	}
	for _, h := range strings.Split(os.Getenv("HEARTH_ALLOWED_HOSTS"), ",") {
		add(h)
	}
	return set
}

// hostAllowed defends against DNS rebinding: the browser sends the ORIGINAL
// attacker hostname in Host even after rebinding to our LAN IP, so a Host
// that isn't a local name, a private/loopback IP literal, or an explicitly
// configured name is rejected.
func hostAllowed(host string, extra map[string]bool) bool {
	h := host
	if hostOnly, _, err := net.SplitHostPort(host); err == nil {
		h = hostOnly
	}
	h = strings.ToLower(strings.TrimSuffix(h, "."))
	if h == "" {
		return false
	}
	if h == "localhost" || strings.HasSuffix(h, ".local") || strings.HasSuffix(h, ".localhost") {
		return true
	}
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
	}
	return extra[h]
}

// originAllowed rejects cross-site state-changing requests: a present Origin
// must match the request Host. Absent Origin (native clients, top-level
// navigations like the OAuth redirect) is allowed.
func originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
}

func New(st *store.Store, hub *sse.Hub, reg *widget.Registry, dist fs.FS) *Server {
	s := &Server{store: st, hub: hub, reg: reg, mux: http.NewServeMux(), allowed: allowedHosts()}

	s.mux.HandleFunc("GET /api/healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/widgets", s.handleListWidgets)
	s.mux.Handle("GET /api/stream", hub)

	s.mux.HandleFunc("GET /api/views", s.handleListViews)
	s.mux.HandleFunc("POST /api/views", s.handleCreateView)
	s.mux.HandleFunc("PUT /api/views/{id}", s.handleUpdateView)
	s.mux.HandleFunc("DELETE /api/views/{id}", s.handleDeleteView)
	s.mux.HandleFunc("POST /api/views/{id}/default", s.handleSetDefaultView)
	s.mux.HandleFunc("POST /api/views/{id}/guest", s.handleSetGuestView)
	s.mux.HandleFunc("PUT /api/views/{id}/schedule", s.handleSetViewSchedule)
	s.mux.HandleFunc("PUT /api/views/order", s.handleReorderViews)
	s.mux.HandleFunc("PUT /api/views/{id}/hidden", s.handleSetViewHidden)
	s.mux.HandleFunc("GET /api/views/export", s.handleExportViews)
	s.mux.HandleFunc("POST /api/views/import", s.handleImportViews)

	s.mux.HandleFunc("GET /api/guest", s.handleGuestConfig)
	s.mux.HandleFunc("POST /api/guest/pin", s.handleSetGuestPin)
	s.mux.HandleFunc("POST /api/guest/verify", s.handleVerifyGuestPin)

	s.mux.HandleFunc("GET /api/night", s.handleGetNight)
	s.mux.HandleFunc("PUT /api/night", s.handleSetNight)

	s.mux.HandleFunc("GET /api/backup", s.handleDownloadBackup)

	s.mux.HandleFunc("GET /api/onboarding", s.handleGetOnboarding)
	s.mux.HandleFunc("POST /api/onboarding", s.handleApplyTemplate)

	s.mux.HandleFunc("GET /api/profiles", s.handleListProfiles)
	s.mux.HandleFunc("POST /api/profiles", s.handleCreateProfile)
	s.mux.HandleFunc("PUT /api/profiles/{id}", s.handleUpdateProfile)
	s.mux.HandleFunc("DELETE /api/profiles/{id}", s.handleDeleteProfile)

	reg.Mount(s.mux)

	s.mux.Handle("/", spaHandler(dist))
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !hostAllowed(r.Host, s.allowed) {
		httpx.Error(w, http.StatusForbidden, "forbidden host")
		return
	}
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		if !originAllowed(r) {
			httpx.Error(w, http.StatusForbidden, "cross-origin request blocked")
			return
		}
	}
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

// handleSetViewHidden toggles a view's presence in the header switcher.
func (s *Server) handleSetViewHidden(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	var req struct {
		Hidden bool `json:"hidden"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	if err := s.store.SetViewHidden(id, req.Hidden); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusNoContent, nil)
}

// handleReorderViews rewrites the switcher order.
func (s *Server) handleReorderViews(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	if len(req.IDs) == 0 {
		httpx.BadRequest(w, "ids is required")
		return
	}
	if err := s.store.ReorderViews(req.IDs); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusNoContent, nil)
}

// handleSetViewSchedule claims (or clears, with both fields empty) a view's
// daily window. Guest-mode precedence is client-side: a scheduled window
// firing during guest mode must never switch the board off the guest view.
func (s *Server) handleSetViewSchedule(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	var req struct {
		Start string `json:"start"`
		End   string `json:"end"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	clearing := req.Start == "" && req.End == ""
	if !clearing && (!hhmmRe.MatchString(req.Start) || !hhmmRe.MatchString(req.End)) {
		httpx.BadRequest(w, "start and end must both be HH:MM, or both empty to clear")
		return
	}
	if err := s.store.SetViewSchedule(id, req.Start, req.End); err != nil {
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
		h := w.Header()
		h.Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "+
				"object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")

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
			if serveCompressed(w, r, dist, path) {
				return
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		if serveCompressed(w, r, dist, "index.html") {
			return
		}
		index, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			http.Error(w, "frontend not built — run `make web` and rebuild", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	})
}

// serveCompressed writes the precompressed sibling (path.br / path.gz) that
// the frontend build emits next to text assets, when the client accepts
// that encoding. Returns false — caller serves the plain file — when no
// acceptable variant exists. The whole dist FS is embedded in the binary,
// so ReadFile is a memory copy, not disk I/O.
func serveCompressed(w http.ResponseWriter, r *http.Request, dist fs.FS, path string) bool {
	accept := r.Header.Get("Accept-Encoding")
	for _, enc := range [...]struct{ coding, ext string }{{"br", ".br"}, {"gzip", ".gz"}} {
		if !acceptsEncoding(accept, enc.coding) {
			continue
		}
		data, err := fs.ReadFile(dist, path+enc.ext)
		if err != nil {
			continue
		}
		ctype := mime.TypeByExtension(filepath.Ext(path))
		if ctype == "" {
			ctype = "application/octet-stream"
		}
		w.Header().Set("Content-Type", ctype)
		w.Header().Set("Content-Encoding", enc.coding)
		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if r.Method != http.MethodHead {
			w.Write(data)
		}
		return true
	}
	return false
}

// acceptsEncoding reports whether an Accept-Encoding header lists the
// coding without disabling it (`br;q=0`). Token match must be exact:
// "gzip" must not match inside "x-gzip-foo".
func acceptsEncoding(header, coding string) bool {
	for part := range strings.SplitSeq(header, ",") {
		token, params, _ := strings.Cut(part, ";")
		if !strings.EqualFold(strings.TrimSpace(token), coding) {
			continue
		}
		params = strings.ReplaceAll(params, " ", "")
		if v, ok := strings.CutPrefix(params, "q="); ok {
			q, err := strconv.ParseFloat(v, 64)
			return err != nil || q > 0
		}
		return true
	}
	return false
}
