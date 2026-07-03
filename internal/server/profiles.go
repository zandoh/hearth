package server

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
)

// Household profiles: the people behind chore assignees and med owners.
// Platform-level (like views), not a widget — several widgets share them.

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func decodeProfile(r *http.Request) (name, color string, ok bool) {
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return "", "", false
	}
	name = strings.TrimSpace(req.Name)
	color = req.Color
	if color == "" {
		color = "#D97742"
	}
	return name, color, name != "" && hexColorRe.MatchString(color)
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
	name, color, ok := decodeProfile(r)
	if !ok {
		httpx.BadRequest(w, "name is required; color must be #RRGGBB")
		return
	}
	p, err := s.store.CreateProfile(name, color)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	s.hub.Publish("profiles", "changed")
	httpx.JSON(w, http.StatusCreated, p)
}

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(w, "invalid id")
		return
	}
	name, color, ok := decodeProfile(r)
	if !ok {
		httpx.BadRequest(w, "name is required; color must be #RRGGBB")
		return
	}
	if err := s.store.UpdateProfile(store.Profile{ID: id, Name: name, Color: color}); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.hub.Publish("profiles", "changed")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(r)
	if !ok {
		httpx.BadRequest(w, "invalid id")
		return
	}
	if err := s.store.DeleteProfile(id); err != nil {
		httpx.Fail(w, err)
		return
	}
	s.hub.Publish("profiles", "changed")
	// Their chores/meds just went unassigned — those widgets must refresh.
	s.hub.Publish("chores", "changed")
	s.hub.Publish("meds", "changed")
	w.WriteHeader(http.StatusNoContent)
}
