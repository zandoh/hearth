// Package weather: current conditions, hourly and daily forecast, and air
// quality from Open-Meteo (free, no API key). The forecast refreshes on a
// background job and is served from memory; the kiosk never waits on an
// upstream API.
package weather

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/httpx"
	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/topics"
	"github.com/zandoh/hearth/internal/widget"
)

const (
	// unitsSetting is stored raw ("imperial"/"metric"), predating the typed
	// Setting; it must keep that shape for existing databases.
	unitsSetting = "weather_units"
	refreshEvery = 15 * time.Minute
)

var locationSetting = store.Setting[location]{Key: "weather_location"}

// meteoAPI is the seam between the widget and Open-Meteo: the forecast,
// air-quality, and geocoding fetches. openMeteoClient is the production
// adapter; tests substitute a fake.
type meteoAPI interface {
	forecast(ctx context.Context, loc location, units string) (forecastData, error)
	airQuality(ctx context.Context, loc location) (airData, error)
	geocode(ctx context.Context, query string) ([]geoResult, error)
}

// airData is the air-quality service's contribution to the forecast: the
// AQI plus pollen counts where Open-Meteo has them.
type airData struct {
	USAQI  *float64
	Pollen *pollenCounts
}

// pollenCounts are current counts in grains/m³ by allergy category; a nil
// field means no data for that category at this location.
type pollenCounts struct {
	Tree  *float64 `json:"tree"`
	Grass *float64 `json:"grass"`
	Weed  *float64 `json:"weed"`
}

type location struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// forecast is the shape served to the frontend.
type forecast struct {
	Location  location        `json:"location"`
	Units     string          `json:"units"` // "imperial" | "metric"
	FetchedAt time.Time       `json:"fetchedAt"`
	Current   json.RawMessage `json:"current"`
	Hourly    json.RawMessage `json:"hourly"`
	Daily     json.RawMessage `json:"daily"`
	USAQI     *float64        `json:"usAqi"`  // nil if the AQI fetch failed
	Pollen    *pollenCounts   `json:"pollen"` // nil if unavailable here or the fetch failed
}

type Widget struct {
	widget.Base
	store *store.Store
	meteo meteoAPI

	mu     sync.RWMutex
	cached *forecast
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{
		Base:  widget.Base{Hub: hub, Slug: topics.Weather},
		store: st,
		meteo: &openMeteoClient{http: &http.Client{Timeout: 20 * time.Second}},
	}
}

func (w *Widget) Jobs() []widget.Job {
	return []widget.Job{{
		Name:     "refresh",
		Interval: refreshEvery,
		Run:      w.refresh,
	}}
}

func (w *Widget) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/widgets/weather/forecast", w.handleForecast)
	mux.HandleFunc("GET /api/widgets/weather/geocode", w.handleGeocode)
	mux.HandleFunc("PUT /api/widgets/weather/location", w.handleSetLocation)
	mux.HandleFunc("PUT /api/widgets/weather/units", w.handleSetUnits)
}

func (w *Widget) refresh(ctx context.Context) error {
	loc, ok, err := locationSetting.Get(w.store)
	if err != nil {
		return err
	}
	if !ok {
		return nil // not configured yet; nothing to do
	}
	units, err := w.store.GetSetting(unitsSetting)
	if err != nil {
		units = "imperial"
	}

	fc, err := w.meteo.forecast(ctx, loc, units)
	if err != nil {
		return err
	}
	next := &forecast{
		Location:  loc,
		Units:     units,
		FetchedAt: time.Now(),
		Current:   fc.Current,
		Hourly:    fc.Hourly,
		Daily:     fc.Daily,
	}

	// AQI and pollen come from a separate Open-Meteo service; treat them as
	// optional so an air-quality outage doesn't take down the whole widget.
	if air, err := w.meteo.airQuality(ctx, loc); err != nil {
		slog.Warn("weather: air quality fetch failed", "err", err)
	} else {
		next.USAQI = air.USAQI
		next.Pollen = air.Pollen
	}

	w.mu.Lock()
	w.cached = next
	w.mu.Unlock()
	w.Publish("changed")
	return nil
}

func (w *Widget) handleForecast(rw http.ResponseWriter, r *http.Request) {
	w.mu.RLock()
	cached := w.cached
	w.mu.RUnlock()
	if cached == nil {
		if _, ok, err := locationSetting.Get(w.store); err == nil && !ok {
			httpx.JSON(rw, http.StatusOK, map[string]any{"configured": false})
			return
		}
		// Configured but first fetch hasn't landed (or failed) — say so.
		httpx.JSON(rw, http.StatusOK, map[string]any{"configured": true, "pending": true})
		return
	}
	httpx.JSON(rw, http.StatusOK, map[string]any{"configured": true, "forecast": cached})
}

// handleGeocode returns candidate places for a free-text query so the user
// picks the right "Richmond" — the geocoder's first hit is often not theirs.
func (w *Widget) handleGeocode(rw http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		httpx.BadRequest(rw, "q is required")
		return
	}
	results, err := w.meteo.geocode(r.Context(), query)
	if err != nil {
		httpx.Fail(rw, err)
		return
	}
	out := []location{}
	for _, res := range results {
		name := res.Name
		if res.Admin1 != "" {
			name += ", " + res.Admin1
		}
		if res.CountryCode != "" {
			name += " (" + res.CountryCode + ")"
		}
		out = append(out, location{Name: name, Latitude: res.Latitude, Longitude: res.Longitude})
	}
	httpx.JSON(rw, http.StatusOK, out)
}

// handleSetLocation saves a chosen candidate and refreshes immediately.
func (w *Widget) handleSetLocation(rw http.ResponseWriter, r *http.Request) {
	var loc location
	if !httpx.Decode(rw, r, &loc) {
		return
	}
	if strings.TrimSpace(loc.Name) == "" {
		httpx.BadRequest(rw, "name, latitude, and longitude are required")
		return
	}
	if err := locationSetting.Set(w.store, loc); err != nil {
		httpx.Fail(rw, err)
		return
	}
	if err := w.refresh(r.Context()); err != nil {
		httpx.Fail(rw, err)
		return
	}
	httpx.JSON(rw, http.StatusOK, loc)
}

// handleSetUnits switches imperial/metric and refreshes immediately so the
// board never shows mixed units.
func (w *Widget) handleSetUnits(rw http.ResponseWriter, r *http.Request) {
	var req struct {
		Units string `json:"units"`
	}
	if !httpx.Decode(rw, r, &req) {
		return
	}
	if req.Units != "imperial" && req.Units != "metric" {
		httpx.BadRequest(rw, `units must be "imperial" or "metric"`)
		return
	}
	if err := w.store.SetSetting(unitsSetting, req.Units); err != nil {
		httpx.Fail(rw, err)
		return
	}
	if err := w.refresh(r.Context()); err != nil {
		httpx.Fail(rw, err)
		return
	}
	httpx.JSON(rw, http.StatusOK, map[string]string{"units": req.Units})
}
