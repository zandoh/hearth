package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
)

// Guest mode: the kiosk can be locked to one designated view for visitors.
// Entering is a tap; leaving requires the household PIN. The PIN and the
// guest view id live in settings; activation itself is per-device (client).

// Both values are stored raw (hex digest / decimal id), predating the typed
// store.Setting; they must keep that shape for existing databases.
const (
	guestPinSetting  = "guest_pin_hash"
	guestViewSetting = "guest_view_id"
)

// ResetGuestPin clears the stored guest PIN. It backs the -reset-guest-pin
// admin flag: the recovery path when the household forgets the PIN.
func ResetGuestPin(st *store.Store) error {
	return st.DeleteSetting(guestPinSetting)
}

func hashPin(pin string) string {
	sum := sha256.Sum256([]byte(pin))
	return hex.EncodeToString(sum[:])
}

func (s *Server) guestConfig() (pinSet bool, guestViewID int64) {
	if _, err := s.store.GetSetting(guestPinSetting); err == nil {
		pinSet = true
	}
	if raw, err := s.store.GetSetting(guestViewSetting); err == nil {
		guestViewID, _ = strconv.ParseInt(raw, 10, 64)
	}
	return pinSet, guestViewID
}

func (s *Server) handleGuestConfig(w http.ResponseWriter, r *http.Request) {
	pinSet, viewID := s.guestConfig()
	httpx.JSON(w, http.StatusOK, map[string]any{"pinSet": pinSet, "guestViewId": viewID})
}

// handleSetGuestPin sets or changes the PIN. Changing (or clearing, by
// sending an empty new pin) requires the current one.
func (s *Server) handleSetGuestPin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pin        string `json:"pin"`
		CurrentPin string `json:"currentPin"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	if existing, err := s.store.GetSetting(guestPinSetting); err == nil {
		if subtle.ConstantTimeCompare([]byte(existing), []byte(hashPin(req.CurrentPin))) != 1 {
			httpx.Error(w, http.StatusForbidden, "current PIN is incorrect")
			return
		}
	}
	if req.Pin == "" {
		if err := s.store.DeleteSetting(guestPinSetting); err != nil {
			httpx.Fail(w, err)
			return
		}
	} else {
		if len(req.Pin) < 4 {
			httpx.BadRequest(w, "PIN must be at least 4 characters")
			return
		}
		if err := s.store.SetSetting(guestPinSetting, hashPin(req.Pin)); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	s.changed(w, topics.Guest, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleVerifyGuestPin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pin string `json:"pin"`
	}
	if !httpx.Decode(w, r, &req) {
		return
	}
	existing, err := s.store.GetSetting(guestPinSetting)
	if err != nil {
		// No PIN on record — e.g. an admin ran `hearth -reset-guest-pin`
		// while a device was locked in guest mode. Any attempt unlocks,
		// so the kiosk can always recover.
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(existing), []byte(hashPin(req.Pin))) != 1 {
		httpx.Error(w, http.StatusForbidden, "incorrect PIN")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleSetGuestView marks a view as the guest view (id 0 clears it).
func (s *Server) handleSetGuestView(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.ID(w, r)
	if !ok {
		return
	}
	if id == 0 {
		if err := s.store.DeleteSetting(guestViewSetting); err != nil {
			httpx.Fail(w, err)
			return
		}
	} else {
		if _, err := s.store.GetView(id); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				httpx.Error(w, http.StatusNotFound, "not found")
				return
			}
			httpx.Fail(w, err)
			return
		}
		if err := s.store.SetSetting(guestViewSetting, strconv.FormatInt(id, 10)); err != nil {
			httpx.Fail(w, err)
			return
		}
	}
	s.hub.Publish(topics.Guest, "changed")
	s.changed(w, topics.Views, http.StatusNoContent, nil)
}
