package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

// newTestServer boots the real Server over a temp-SQLite store — the same
// cheap-store trick the widget tests use, lifted one level. The platform
// handlers hold the backend's branchiest logic; this is their interface.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	srv := httptest.NewServer(New(st, sse.NewHub(), widget.NewRegistry(), fstest.MapFS{}))
	t.Cleanup(srv.Close)
	return srv
}

func call(t *testing.T, srv *httptest.Server, method, path string, body any) (*http.Response, []byte) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(res.Body); err != nil {
		t.Fatal(err)
	}
	return res, buf.Bytes()
}

func wantStatus(t *testing.T, res *http.Response, body []byte, want int) {
	t.Helper()
	if res.StatusCode != want {
		t.Fatalf("%s %s = %d, want %d (%s)", res.Request.Method, res.Request.URL.Path, res.StatusCode, want, body)
	}
}

func TestGuestPinLifecycle(t *testing.T) {
	srv := newTestServer(t)

	// No PIN on record: verify succeeds with anything — the recovery path
	// after `hearth -reset-guest-pin` while a device is locked.
	res, body := call(t, srv, "POST", "/api/guest/verify", map[string]string{"pin": "whatever"})
	wantStatus(t, res, body, http.StatusOK)

	// Too short is rejected.
	res, body = call(t, srv, "POST", "/api/guest/pin", map[string]string{"pin": "12"})
	wantStatus(t, res, body, http.StatusBadRequest)

	// Set, verify wrong, verify right.
	res, body = call(t, srv, "POST", "/api/guest/pin", map[string]string{"pin": "4242"})
	wantStatus(t, res, body, http.StatusOK)
	res, body = call(t, srv, "POST", "/api/guest/verify", map[string]string{"pin": "0000"})
	wantStatus(t, res, body, http.StatusForbidden)
	res, body = call(t, srv, "POST", "/api/guest/verify", map[string]string{"pin": "4242"})
	wantStatus(t, res, body, http.StatusOK)

	// Changing requires the current PIN.
	res, body = call(t, srv, "POST", "/api/guest/pin", map[string]string{"pin": "9999", "currentPin": "wrong"})
	wantStatus(t, res, body, http.StatusForbidden)
	res, body = call(t, srv, "POST", "/api/guest/pin", map[string]string{"pin": "9999", "currentPin": "4242"})
	wantStatus(t, res, body, http.StatusOK)

	// Clearing (empty new PIN) also requires the current one, then verify
	// falls back to the recovery behaviour.
	res, body = call(t, srv, "POST", "/api/guest/pin", map[string]string{"pin": "", "currentPin": "9999"})
	wantStatus(t, res, body, http.StatusOK)
	res, body = call(t, srv, "POST", "/api/guest/verify", map[string]string{"pin": ""})
	wantStatus(t, res, body, http.StatusOK)
}

func TestViewScheduleValidation(t *testing.T) {
	srv := newTestServer(t)

	res, body := call(t, srv, "PUT", "/api/views/1/schedule", map[string]string{"start": "07:00", "end": "09:00"})
	wantStatus(t, res, body, http.StatusNoContent)

	// Both-or-neither: half a window is rejected.
	res, body = call(t, srv, "PUT", "/api/views/1/schedule", map[string]string{"start": "07:00", "end": ""})
	wantStatus(t, res, body, http.StatusBadRequest)
	res, body = call(t, srv, "PUT", "/api/views/1/schedule", map[string]string{"start": "25:00", "end": "09:00"})
	wantStatus(t, res, body, http.StatusBadRequest)

	// Clearing with both empty.
	res, body = call(t, srv, "PUT", "/api/views/1/schedule", map[string]string{"start": "", "end": ""})
	wantStatus(t, res, body, http.StatusNoContent)

	res, body = call(t, srv, "PUT", "/api/views/999/schedule", map[string]string{"start": "07:00", "end": "09:00"})
	wantStatus(t, res, body, http.StatusNotFound)
}

func TestNightConfigValidation(t *testing.T) {
	srv := newTestServer(t)

	for _, bad := range []map[string]any{
		{"enabled": true, "start": "22:00", "end": "07:00", "level": 0.1},
		{"enabled": true, "start": "22:00", "end": "07:00", "level": 0.9},
		{"enabled": true, "start": "2200", "end": "07:00", "level": 0.6},
	} {
		res, body := call(t, srv, "PUT", "/api/night", bad)
		wantStatus(t, res, body, http.StatusBadRequest)
	}

	res, body := call(t, srv, "PUT", "/api/night", map[string]any{"enabled": true, "start": "22:00", "end": "07:00", "level": 0.6})
	wantStatus(t, res, body, http.StatusOK)

	res, body = call(t, srv, "GET", "/api/night", nil)
	wantStatus(t, res, body, http.StatusOK)
	var cfg struct{ Level float64 }
	if err := json.Unmarshal(body, &cfg); err != nil || cfg.Level != 0.6 {
		t.Fatalf("round-trip: %s err=%v", body, err)
	}
}

func TestOnboardingPristineAndTemplates(t *testing.T) {
	srv := newTestServer(t)

	res, body := call(t, srv, "GET", "/api/onboarding", nil)
	wantStatus(t, res, body, http.StatusOK)
	if string(body) == "" || !bytes.Contains(body, []byte(`"needed":true`)) {
		t.Fatalf("fresh install should need onboarding: %s", body)
	}

	res, body = call(t, srv, "POST", "/api/onboarding", map[string]string{"template": "nope"})
	wantStatus(t, res, body, http.StatusBadRequest)

	res, body = call(t, srv, "POST", "/api/onboarding", map[string]string{"template": "family"})
	wantStatus(t, res, body, http.StatusOK)

	res, body = call(t, srv, "GET", "/api/views", nil)
	wantStatus(t, res, body, http.StatusOK)
	var views []struct {
		Layout []struct{ Widget string }
	}
	if err := json.Unmarshal(body, &views); err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 || len(views[0].Layout) != 8 {
		t.Fatalf("family template should land 8 widgets, got %s", body)
	}

	// Answered: never asks again, even though the layout changed.
	res, body = call(t, srv, "GET", "/api/onboarding", nil)
	wantStatus(t, res, body, http.StatusOK)
	if !bytes.Contains(body, []byte(`"needed":false`)) {
		t.Fatalf("onboarding should be remembered: %s", body)
	}
}

func TestOnboardingNotNeededOnTouchedInstall(t *testing.T) {
	srv := newTestServer(t)

	// Touch the board (empty layout counts as touched: not the pristine seed).
	res, body := call(t, srv, "PUT", "/api/views/1", map[string]any{"name": "Home", "layout": []any{}})
	wantStatus(t, res, body, http.StatusOK)

	res, body = call(t, srv, "GET", "/api/onboarding", nil)
	wantStatus(t, res, body, http.StatusOK)
	if !bytes.Contains(body, []byte(`"needed":false`)) {
		t.Fatalf("touched install must not be prompted: %s", body)
	}
}

func TestViewHiddenAndReorder(t *testing.T) {
	srv := newTestServer(t)
	for _, name := range []string{"B", "C"} {
		res, body := call(t, srv, "POST", "/api/views", map[string]any{"name": name, "layout": []any{}})
		wantStatus(t, res, body, http.StatusCreated)
	}

	res, body := call(t, srv, "PUT", "/api/views/2/hidden", map[string]bool{"hidden": true})
	wantStatus(t, res, body, http.StatusNoContent)

	res, body = call(t, srv, "PUT", "/api/views/order", map[string]any{"ids": []int{3, 1, 2}})
	wantStatus(t, res, body, http.StatusNoContent)

	res, body = call(t, srv, "GET", "/api/views", nil)
	wantStatus(t, res, body, http.StatusOK)
	var views []struct {
		ID     int64
		Hidden bool
	}
	if err := json.Unmarshal(body, &views); err != nil {
		t.Fatal(err)
	}
	got := fmt.Sprintf("%d,%d,%d", views[0].ID, views[1].ID, views[2].ID)
	if got != "3,1,2" {
		t.Fatalf("order = %s, want 3,1,2", got)
	}
	if !views[2].Hidden {
		t.Fatal("hidden flag lost through reorder")
	}

	res, body = call(t, srv, "PUT", "/api/views/order", map[string]any{"ids": []int{}})
	wantStatus(t, res, body, http.StatusBadRequest)
}
