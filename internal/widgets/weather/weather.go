// Package weather: current conditions, hourly and daily forecast, and air
// quality from Open-Meteo (free, no API key). The forecast refreshes on a
// background job and is served from memory; the kiosk never waits on an
// upstream API.
package weather

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/zandoh/hearth/internal/sse"
	"github.com/zandoh/hearth/internal/store"
	"github.com/zandoh/hearth/internal/widget"
)

const (
	forecastAPI   = "https://api.open-meteo.com/v1/forecast"
	airQualityAPI = "https://air-quality-api.open-meteo.com/v1/air-quality"
	geocodingAPI  = "https://geocoding-api.open-meteo.com/v1/search"

	locationSetting = "weather_location"
	refreshEvery    = 15 * time.Minute
)

type location struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// forecast is the shape served to the frontend.
type forecast struct {
	Location  location        `json:"location"`
	FetchedAt time.Time       `json:"fetchedAt"`
	Current   json.RawMessage `json:"current"`
	Hourly    json.RawMessage `json:"hourly"`
	Daily     json.RawMessage `json:"daily"`
	USAQI     *float64        `json:"usAqi"` // nil if the AQI fetch failed
}

type Widget struct {
	store *store.Store
	hub   *sse.Hub
	http  *http.Client

	mu     sync.RWMutex
	cached *forecast
}

func New(st *store.Store, hub *sse.Hub) *Widget {
	return &Widget{
		store: st,
		hub:   hub,
		http:  &http.Client{Timeout: 20 * time.Second},
	}
}

func (w *Widget) ID() string { return "weather" }

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
}

func (w *Widget) loadLocation() (location, error) {
	raw, err := w.store.GetSetting(locationSetting)
	if err != nil {
		return location{}, err
	}
	var loc location
	err = json.Unmarshal([]byte(raw), &loc)
	return loc, err
}

func (w *Widget) getJSON(ctx context.Context, endpoint string, q url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := w.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", endpoint, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func (w *Widget) refresh(ctx context.Context) error {
	loc, err := w.loadLocation()
	if errors.Is(err, store.ErrNotFound) {
		return nil // not configured yet; nothing to do
	}
	if err != nil {
		return err
	}

	lat := fmt.Sprintf("%.4f", loc.Latitude)
	lon := fmt.Sprintf("%.4f", loc.Longitude)

	var fc struct {
		Current json.RawMessage `json:"current"`
		Hourly  json.RawMessage `json:"hourly"`
		Daily   json.RawMessage `json:"daily"`
	}
	err = w.getJSON(ctx, forecastAPI, url.Values{
		"latitude":         {lat},
		"longitude":        {lon},
		"current":          {"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"},
		"hourly":           {"temperature_2m,precipitation_probability,weather_code"},
		"daily":            {"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"},
		"forecast_days":    {"6"},
		"forecast_hours":   {"12"},
		"timezone":         {"auto"},
		"temperature_unit": {"fahrenheit"},
		"wind_speed_unit":  {"mph"},
	}, &fc)
	if err != nil {
		return err
	}

	next := &forecast{
		Location:  loc,
		FetchedAt: time.Now(),
		Current:   fc.Current,
		Hourly:    fc.Hourly,
		Daily:     fc.Daily,
	}

	// AQI comes from a separate Open-Meteo service; treat it as optional so
	// an air-quality outage doesn't take down the whole widget.
	var aq struct {
		Current struct {
			USAQI *float64 `json:"us_aqi"`
		} `json:"current"`
	}
	if err := w.getJSON(ctx, airQualityAPI, url.Values{
		"latitude":  {lat},
		"longitude": {lon},
		"current":   {"us_aqi"},
	}, &aq); err != nil {
		slog.Warn("weather: air quality fetch failed", "err", err)
	} else {
		next.USAQI = aq.Current.USAQI
	}

	w.mu.Lock()
	w.cached = next
	w.mu.Unlock()
	w.hub.Publish("weather", "changed")
	return nil
}

func (w *Widget) handleForecast(rw http.ResponseWriter, r *http.Request) {
	w.mu.RLock()
	cached := w.cached
	w.mu.RUnlock()
	if cached == nil {
		if _, err := w.loadLocation(); errors.Is(err, store.ErrNotFound) {
			writeJSON(rw, http.StatusOK, map[string]any{"configured": false})
			return
		}
		// Configured but first fetch hasn't landed (or failed) — say so.
		writeJSON(rw, http.StatusOK, map[string]any{"configured": true, "pending": true})
		return
	}
	writeJSON(rw, http.StatusOK, map[string]any{"configured": true, "forecast": cached})
}

// handleGeocode returns candidate places for a free-text query so the user
// picks the right "Richmond" — the geocoder's first hit is often not theirs.
func (w *Widget) handleGeocode(rw http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		badRequest(rw, "q is required")
		return
	}
	var geo struct {
		Results []struct {
			Name        string  `json:"name"`
			Admin1      string  `json:"admin1"`
			CountryCode string  `json:"country_code"`
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
		} `json:"results"`
	}
	if err := w.getJSON(r.Context(), geocodingAPI, url.Values{
		"name":  {query},
		"count": {"6"},
	}, &geo); err != nil {
		writeErr(rw, err)
		return
	}
	out := []location{}
	for _, res := range geo.Results {
		name := res.Name
		if res.Admin1 != "" {
			name += ", " + res.Admin1
		}
		if res.CountryCode != "" {
			name += " (" + res.CountryCode + ")"
		}
		out = append(out, location{Name: name, Latitude: res.Latitude, Longitude: res.Longitude})
	}
	writeJSON(rw, http.StatusOK, out)
}

// handleSetLocation saves a chosen candidate and refreshes immediately.
func (w *Widget) handleSetLocation(rw http.ResponseWriter, r *http.Request) {
	var loc location
	if err := json.NewDecoder(r.Body).Decode(&loc); err != nil ||
		strings.TrimSpace(loc.Name) == "" {
		badRequest(rw, "name, latitude, and longitude are required")
		return
	}
	b, err := json.Marshal(loc)
	if err != nil {
		writeErr(rw, err)
		return
	}
	if err := w.store.SetSetting(locationSetting, string(b)); err != nil {
		writeErr(rw, err)
		return
	}
	if err := w.refresh(r.Context()); err != nil {
		writeErr(rw, err)
		return
	}
	writeJSON(rw, http.StatusOK, loc)
}

func writeJSON(rw http.ResponseWriter, status int, v any) {
	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	json.NewEncoder(rw).Encode(v)
}

func writeErr(rw http.ResponseWriter, err error) {
	slog.Error("weather request failed", "err", err)
	writeJSON(rw, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}

func badRequest(rw http.ResponseWriter, msg string) {
	writeJSON(rw, http.StatusBadRequest, map[string]string{"error": msg})
}
