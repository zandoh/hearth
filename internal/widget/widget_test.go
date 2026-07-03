package widget

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/sse"
)

// subscribe connects an SSE client to hub and returns a reader positioned
// after the ": connected" preamble, so the next line read is the first event.
func subscribe(t *testing.T, hub *sse.Hub) *bufio.Reader {
	t.Helper()
	srv := httptest.NewServer(hub)
	t.Cleanup(srv.Close)
	res, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	br := bufio.NewReader(res.Body)
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading SSE preamble: %v", err)
		}
		if strings.HasPrefix(line, ": connected") {
			br.ReadString('\n') // trailing blank line
			return br
		}
	}
}

// nextEvent reads one SSE event and returns its envelope fields.
func nextEvent(t *testing.T, br *bufio.Reader) (topic string, data any) {
	t.Helper()
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading SSE event: %v", err)
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var env struct {
			Topic string `json:"topic"`
			Data  any    `json:"data"`
		}
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &env); err != nil {
			t.Fatalf("bad envelope %q: %v", line, err)
		}
		return env.Topic, env.Data
	}
}

func TestBaseChangedPublishesOnOwnTopic(t *testing.T) {
	hub := sse.NewHub()
	br := subscribe(t, hub)
	b := Base{Hub: hub, Slug: "grocery"}

	rec := httptest.NewRecorder()
	b.Changed(rec, http.StatusCreated, map[string]string{"status": "ok"})
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Errorf("body = %s, want the JSON payload", rec.Body)
	}
	topic, data := nextEvent(t, br)
	if topic != "grocery" || data != "changed" {
		t.Errorf("published (%q, %v), want (grocery, changed)", topic, data)
	}
}

func TestBaseChangedNilBodyWritesStatusOnly(t *testing.T) {
	hub := sse.NewHub()
	br := subscribe(t, hub)
	b := Base{Hub: hub, Slug: "chores"}

	rec := httptest.NewRecorder()
	b.Changed(rec, http.StatusNoContent, nil)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("204 must have no body, got %q", rec.Body)
	}
	if topic, _ := nextEvent(t, br); topic != "chores" {
		t.Errorf("published on %q, want chores", topic)
	}
}

type fakeWidget struct {
	Base
	mounted *[]string
}

func (f fakeWidget) Routes(mux *http.ServeMux) {
	*f.mounted = append(*f.mounted, f.Slug)
	mux.HandleFunc("GET /api/widgets/"+f.Slug, func(w http.ResponseWriter, r *http.Request) {})
}

func TestRegistryRegisterAndMountOrder(t *testing.T) {
	reg := NewRegistry()
	var mounted []string
	reg.Register(fakeWidget{Base: Base{Slug: "clock"}, mounted: &mounted})
	reg.Register(fakeWidget{Base: Base{Slug: "weather"}, mounted: &mounted})

	if ids := reg.IDs(); len(ids) != 2 || ids[0] != "clock" || ids[1] != "weather" {
		t.Errorf("IDs() = %v, want registration order [clock weather]", ids)
	}

	mux := http.NewServeMux()
	reg.Mount(mux)
	if len(mounted) != 2 || mounted[0] != "clock" || mounted[1] != "weather" {
		t.Errorf("mounted = %v, want registration order [clock weather]", mounted)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/widgets/weather", nil))
	if rec.Code != http.StatusOK {
		t.Errorf("mounted route: status = %d, want 200", rec.Code)
	}
}
