package weather

// Handler and refresh tests drive the widget through the meteoAPI seam: a
// fake adapter stands in for Open-Meteo, the store is real SQLite.

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
)

type fakeMeteo struct {
	fc      forecastData
	fcErr   error
	air     airData
	aqiErr  error
	results []geoResult
}

func (f *fakeMeteo) forecast(ctx context.Context, loc location, units string) (forecastData, error) {
	return f.fc, f.fcErr
}
func (f *fakeMeteo) airQuality(ctx context.Context, loc location) (airData, error) {
	return f.air, f.aqiErr
}
func (f *fakeMeteo) geocode(ctx context.Context, query string) ([]geoResult, error) {
	return f.results, nil
}

func newTestWidget(t *testing.T) (*Widget, *fakeMeteo, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	w := New(st, sse.NewHub())
	aqi, grass := 42.0, 12.0
	fake := &fakeMeteo{
		fc:  forecastData{Current: json.RawMessage(`{"temperature_2m":71}`)},
		air: airData{USAQI: &aqi, Pollen: &pollenCounts{Grass: &grass}},
	}
	w.meteo = fake
	return w, fake, st
}

func setLocation(t *testing.T, st *store.Store) {
	t.Helper()
	if err := locationSetting.Set(st, location{Name: "Richmond, VA (US)", Latitude: 37.5, Longitude: -77.4}); err != nil {
		t.Fatal(err)
	}
}

func get(t *testing.T, w *Widget, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	w.Routes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec
}

// subscribe connects an SSE client to the widget's hub and returns a reader
// positioned after the ": connected" preamble.
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

func TestRefreshPopulatesCacheAndPublishes(t *testing.T) {
	w, _, st := newTestWidget(t)
	setLocation(t, st)
	br := subscribe(t, w.Hub)

	if err := w.refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading published event: %v", err)
		}
		if strings.HasPrefix(line, "data: ") {
			if !strings.Contains(line, `"topic":"weather"`) || !strings.Contains(line, `"changed"`) {
				t.Errorf("published %q, want changed on the weather topic", line)
			}
			break
		}
	}
	w.mu.RLock()
	cached := w.cached
	w.mu.RUnlock()
	if cached == nil {
		t.Fatal("refresh did not populate the cache")
	}
	if cached.Location.Name != "Richmond, VA (US)" || string(cached.Current) != `{"temperature_2m":71}` {
		t.Errorf("cached = %+v", cached)
	}
	if cached.USAQI == nil || *cached.USAQI != 42.0 {
		t.Errorf("USAQI = %v, want 42", cached.USAQI)
	}
	if cached.Pollen == nil || cached.Pollen.Grass == nil || *cached.Pollen.Grass != 12.0 {
		t.Errorf("Pollen = %+v, want grass 12", cached.Pollen)
	}

	rec := get(t, w, "/api/widgets/weather/forecast")
	var res struct {
		Configured bool      `json:"configured"`
		Forecast   *forecast `json:"forecast"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if !res.Configured || res.Forecast == nil || res.Forecast.Units != "imperial" {
		t.Errorf("forecast response = %+v", res)
	}
}

func TestRefreshUnconfiguredIsANoOp(t *testing.T) {
	w, _, _ := newTestWidget(t)
	if err := w.refresh(context.Background()); err != nil {
		t.Fatalf("unconfigured refresh should be a no-op, got %v", err)
	}
	if w.cached != nil {
		t.Error("unconfigured refresh must not populate the cache")
	}
}

func TestRefreshServesForecastWhenAQIFails(t *testing.T) {
	w, fake, st := newTestWidget(t)
	setLocation(t, st)
	fake.aqiErr = errors.New("air quality service down")

	if err := w.refresh(context.Background()); err != nil {
		t.Fatalf("AQI outage must not fail the refresh: %v", err)
	}
	w.mu.RLock()
	cached := w.cached
	w.mu.RUnlock()
	if cached == nil || cached.USAQI != nil || cached.Pollen != nil {
		t.Fatalf("cached = %+v, want forecast with nil USAQI and pollen", cached)
	}
	if rec := get(t, w, "/api/widgets/weather/forecast"); rec.Code != http.StatusOK {
		t.Errorf("forecast after AQI failure: %d", rec.Code)
	}
}

func TestHandleForecastBeforeConfiguration(t *testing.T) {
	w, _, st := newTestWidget(t)

	rec := get(t, w, "/api/widgets/weather/forecast")
	var res map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res["configured"] != false {
		t.Errorf("unconfigured response = %v", res)
	}

	// Configured but no fetch yet: pending, not a bare "unconfigured".
	setLocation(t, st)
	rec = get(t, w, "/api/widgets/weather/forecast")
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res["configured"] != true || res["pending"] != true {
		t.Errorf("pending response = %v", res)
	}
}

func TestHandleGeocode(t *testing.T) {
	w, fake, _ := newTestWidget(t)
	fake.results = []geoResult{
		{Name: "Richmond", Admin1: "Virginia", CountryCode: "US", Latitude: 37.5, Longitude: -77.4},
		{Name: "Richmond", CountryCode: "AU", Latitude: -33.6, Longitude: 150.7},
	}

	rec := get(t, w, "/api/widgets/weather/geocode?q=richmond")
	if rec.Code != http.StatusOK {
		t.Fatalf("geocode: %d %s", rec.Code, rec.Body)
	}
	var out []location
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0].Name != "Richmond, Virginia (US)" || out[1].Name != "Richmond (AU)" {
		t.Errorf("geocode results = %+v", out)
	}

	if rec := get(t, w, "/api/widgets/weather/geocode?q="); rec.Code != http.StatusBadRequest {
		t.Errorf("empty query: %d, want 400", rec.Code)
	}
}
