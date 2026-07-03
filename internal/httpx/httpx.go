// Package httpx owns Hearth's HTTP response conventions: JSON encoding,
// the error-exposure policy, and path id parsing. Every handler — platform
// routes and widgets alike — responds through this package, so errors map
// to statuses one way and internal error text never reaches a client.
package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/zandoh/hearth/internal/store"
)

// JSON writes v with the given status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("write response", "err", err)
	}
}

// Error writes {"error": msg} with the given status.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}

// BadRequest writes a 400 with the given message.
func BadRequest(w http.ResponseWriter, msg string) {
	Error(w, http.StatusBadRequest, msg)
}

// Fail reports a handler error: store.ErrNotFound becomes a 404; anything
// else is logged server-side and answered with a generic 500. Handlers with
// a domain-specific mapping (e.g. calendar's "not connected" → 409) check
// for it first and fall through to Fail.
func Fail(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		Error(w, http.StatusNotFound, "not found")
		return
	}
	slog.Error("request failed", "err", err)
	Error(w, http.StatusInternalServerError, "internal error")
}

// ID parses the {id} path value.
func ID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}
