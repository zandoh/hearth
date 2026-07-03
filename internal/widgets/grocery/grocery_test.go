package grocery

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
)

func newTestMux(t *testing.T) *http.ServeMux {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	mux := http.NewServeMux()
	New(st, sse.NewHub()).Routes(mux)
	return mux
}

func doJSON(t *testing.T, mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func listItems(t *testing.T, mux *http.ServeMux) []store.GroceryItem {
	t.Helper()
	rec := doJSON(t, mux, "GET", "/api/widgets/grocery", "")
	var items []store.GroceryItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	return items
}

func addItem(t *testing.T, mux *http.ServeMux, name string) store.GroceryItem {
	t.Helper()
	rec := doJSON(t, mux, "POST", "/api/widgets/grocery", `{"name":"`+name+`"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add %s: %d %s", name, rec.Code, rec.Body)
	}
	var item store.GroceryItem
	if err := json.Unmarshal(rec.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	return item
}

func TestGroceryToggleAndClear(t *testing.T) {
	mux := newTestMux(t)
	milk := addItem(t, mux, "Milk")
	addItem(t, mux, "Eggs")

	rec := doJSON(t, mux, "POST", fmt.Sprintf("/api/widgets/grocery/%d/toggle", milk.ID), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("toggle: %d %s", rec.Code, rec.Body)
	}
	items := listItems(t, mux)
	// Checked items sink to the bottom of the list.
	if len(items) != 2 || items[0].Name != "Eggs" || !items[1].Checked {
		t.Fatalf("after toggle: %+v", items)
	}

	rec = doJSON(t, mux, "POST", "/api/widgets/grocery/clear-checked", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("clear-checked: %d %s", rec.Code, rec.Body)
	}
	items = listItems(t, mux)
	if len(items) != 1 || items[0].Name != "Eggs" {
		t.Fatalf("clear should drop only checked items: %+v", items)
	}
}

func TestGroceryValidationAndNotFound(t *testing.T) {
	mux := newTestMux(t)
	if rec := doJSON(t, mux, "POST", "/api/widgets/grocery", `{"name":"  "}`); rec.Code != http.StatusBadRequest {
		t.Errorf("blank name: got %d, want 400", rec.Code)
	}
	if rec := doJSON(t, mux, "POST", "/api/widgets/grocery/999/toggle", ""); rec.Code != http.StatusNotFound {
		t.Errorf("toggle missing: got %d, want 404", rec.Code)
	}
	if rec := doJSON(t, mux, "DELETE", "/api/widgets/grocery/999", ""); rec.Code != http.StatusNotFound {
		t.Errorf("delete missing: got %d, want 404", rec.Code)
	}
}
