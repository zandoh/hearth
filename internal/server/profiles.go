package server

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
)

// Household profiles: the people behind chore assignees and med owners.
// Platform-level (like views), not a widget — several widgets share them.

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// decodeProfile reads and validates a profile body, answering the 400
// itself so handlers reduce to `if !ok { return }`.
func decodeProfile(w http.ResponseWriter, r *http.Request) (name, color string, ok bool) {
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if !httpx.Decode(w, r, &req) {
		return "", "", false
	}
	name = strings.TrimSpace(req.Name)
	color = req.Color
	if color == "" {
		color = "#D97742"
	}
	if name == "" || !hexColorRe.MatchString(color) {
		httpx.BadRequest(w, "name is required; color must be #RRGGBB")
		return "", "", false
	}
	return name, color, true
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
	name, color, ok := decodeProfile(w, r)
	if !ok {
		return
	}
	p, err := s.store.CreateProfile(name, color)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Profiles, http.StatusCreated, p)
}

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	name, color, ok := decodeProfile(w, r)
	if !ok {
		return
	}
	if err := s.store.UpdateProfile(store.Profile{ID: id, Name: name, Color: color}); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.changed(w, topics.Profiles, http.StatusNoContent, nil)
}

func (s *Server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	if err := s.store.DeleteProfile(id); err != nil {
		httpx.Fail(w, err)
		return
	}
	// Their chores/meds just went unassigned — those widgets must refresh.
	s.hub.Publish(topics.Chores, "changed")
	s.hub.Publish(topics.Meds, "changed")
	s.changed(w, topics.Profiles, http.StatusNoContent, nil)
}
