package server

// Layout transfer: export the household's views as a portable JSON document
// and import one produced elsewhere — the dev-board ↔ home-server path.
// Only layout-shaped data travels: ids and default status stay with each
// instance, and widget data (events, lists, chores) is never part of it.

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
)

// exportVersion names the document schema so a future shape change can be
// detected instead of half-imported.
const exportVersion = 1

type transferView struct {
	Name          string             `json:"name"`
	Layout        []store.LayoutItem `json:"layout"`
	Hidden        bool               `json:"hidden,omitempty"`
	ScheduleStart string             `json:"scheduleStart,omitempty"`
	ScheduleEnd   string             `json:"scheduleEnd,omitempty"`
}

type transferDoc struct {
	HearthViews int            `json:"hearthViews"` // exportVersion
	ExportedAt  time.Time      `json:"exportedAt"`
	Views       []transferView `json:"views"`
}

func (s *Server) handleExportViews(w http.ResponseWriter, r *http.Request) {
	views, err := s.store.ListViews()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	doc := transferDoc{HearthViews: exportVersion, ExportedAt: time.Now().UTC()}
	for _, v := range views {
		doc.Views = append(doc.Views, transferView{
			Name:          v.Name,
			Layout:        v.Layout,
			Hidden:        v.Hidden,
			ScheduleStart: v.ScheduleStart,
			ScheduleEnd:   v.ScheduleEnd,
		})
	}
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=hearth-views-%s.json", time.Now().Format("2006-01-02")))
	httpx.JSON(w, http.StatusOK, doc)
}

// handleImportViews appends a document's views to the board. Additive on
// purpose: an import never deletes or overwrites — colliding names get a
// numeric suffix and the household prunes by hand.
func (s *Server) handleImportViews(w http.ResponseWriter, r *http.Request) {
	var doc transferDoc
	if !httpx.Decode(w, r, &doc) {
		return
	}
	if doc.HearthViews != exportVersion {
		httpx.BadRequest(w, fmt.Sprintf("unsupported export version %d (this Hearth speaks %d)",
			doc.HearthViews, exportVersion))
		return
	}
	if len(doc.Views) == 0 {
		httpx.BadRequest(w, "the document contains no views")
		return
	}

	existing, err := s.store.ListViews()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	taken := map[string]bool{}
	for _, v := range existing {
		taken[v.Name] = true
	}

	imports := make([]store.ImportedView, 0, len(doc.Views))
	for i, v := range doc.Views {
		name := strings.TrimSpace(v.Name)
		if name == "" {
			httpx.BadRequest(w, fmt.Sprintf("view %d has no name", i+1))
			return
		}
		scheduled := v.ScheduleStart != "" || v.ScheduleEnd != ""
		if scheduled && (!hhmmRe.MatchString(v.ScheduleStart) || !hhmmRe.MatchString(v.ScheduleEnd)) {
			httpx.BadRequest(w, fmt.Sprintf("view %q has a malformed schedule", name))
			return
		}
		name = dedupeName(name, taken)
		taken[name] = true
		layout := v.Layout
		if layout == nil {
			layout = []store.LayoutItem{}
		}
		imports = append(imports, store.ImportedView{
			Name:          name,
			Layout:        layout,
			Hidden:        v.Hidden,
			ScheduleStart: v.ScheduleStart,
			ScheduleEnd:   v.ScheduleEnd,
		})
	}

	created, err := s.store.ImportViews(imports)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Views, http.StatusCreated, map[string]any{"imported": created})
}

// dedupeName finds the first free "name", "name 2", "name 3", … so an
// import next to an existing "Home" lands as "Home 2" rather than a clone
// the switcher can't tell apart.
func dedupeName(name string, taken map[string]bool) string {
	if !taken[name] {
		return name
	}
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s %d", name, i)
		if !taken[candidate] {
			return candidate
		}
	}
}
