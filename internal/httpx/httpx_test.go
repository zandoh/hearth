package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/store"
)

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%s)", err, rec.Body)
	}
	return body
}

func TestJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	JSON(rec, http.StatusCreated, map[string]string{"status": "ok"})
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	if body := decodeBody(t, rec); body["status"] != "ok" {
		t.Errorf("body = %v", body)
	}
}

func TestBadRequest(t *testing.T) {
	rec := httptest.NewRecorder()
	BadRequest(rec, "name is required")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if body := decodeBody(t, rec); body["error"] != "name is required" {
		t.Errorf(`body = %v, want {"error": "name is required"}`, body)
	}
}

func TestDecode(t *testing.T) {
	var v struct {
		Name string `json:"name"`
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"Milk"}`))
	if !Decode(rec, req, &v) || v.Name != "Milk" {
		t.Errorf("valid body: ok=false or v=%+v", v)
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/", strings.NewReader(`{not json`))
	if Decode(rec, req, &v) {
		t.Error("invalid body: want ok=false")
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("invalid body: status = %d, want 400", rec.Code)
	}
	if body := decodeBody(t, rec); body["error"] != "invalid request body" {
		t.Errorf("invalid body: body = %v", body)
	}
}

func TestID(t *testing.T) {
	// mux populates the {id} path value, so route through one like handlers do.
	newRec := func(path string) (*httptest.ResponseRecorder, int64, bool) {
		var id int64
		var ok bool
		mux := http.NewServeMux()
		mux.HandleFunc("GET /things/{id}", func(w http.ResponseWriter, r *http.Request) {
			id, ok = ID(w, r)
		})
		mux.HandleFunc("GET /bare", func(w http.ResponseWriter, r *http.Request) {
			id, ok = ID(w, r)
		})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		return rec, id, ok
	}

	if _, id, ok := newRec("/things/42"); !ok || id != 42 {
		t.Errorf("valid id: got (%d, %v), want (42, true)", id, ok)
	}
	if rec, _, ok := newRec("/things/abc"); ok || rec.Code != http.StatusBadRequest {
		t.Errorf("bad id: ok=%v status=%d, want false/400", ok, rec.Code)
	}
	if rec, _, ok := newRec("/bare"); ok || rec.Code != http.StatusBadRequest {
		t.Errorf("missing id: ok=%v status=%d, want false/400", ok, rec.Code)
	}
}

func TestFail(t *testing.T) {
	rec := httptest.NewRecorder()
	Fail(rec, store.ErrNotFound)
	if rec.Code != http.StatusNotFound {
		t.Errorf("ErrNotFound: status = %d, want 404", rec.Code)
	}
	if body := decodeBody(t, rec); body["error"] != "not found" {
		t.Errorf("ErrNotFound: body = %v", body)
	}

	rec = httptest.NewRecorder()
	Fail(rec, errors.New("disk on fire"))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("other error: status = %d, want 500", rec.Code)
	}
	// The policy: internal error text never reaches a client.
	if strings.Contains(rec.Body.String(), "disk on fire") {
		t.Errorf("internal error text leaked: %s", rec.Body)
	}
}
