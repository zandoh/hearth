package weather

// Open-Meteo HTTP adapter, standard library only. Three separate services
// back the widget: forecast, air quality, and geocoding, all keyless GETs
// returning JSON.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

const (
	forecastAPI   = "https://api.open-meteo.com/v1/forecast"
	airQualityAPI = "https://air-quality-api.open-meteo.com/v1/air-quality"
	geocodingAPI  = "https://geocoding-api.open-meteo.com/v1/search"
)

// forecastData is the raw forecast payload, passed through to the frontend
// untouched.
type forecastData struct {
	Current json.RawMessage
	Hourly  json.RawMessage
	Daily   json.RawMessage
}

// geoResult is one geocoder candidate; the widget assembles the display name.
type geoResult struct {
	Name        string
	Admin1      string
	CountryCode string
	Latitude    float64
	Longitude   float64
}

// unitsParams maps a units preference to Open-Meteo request parameters.
// Anything unrecognized falls back to imperial.
func unitsParams(units string) (temp, wind string) {
	if units == "metric" {
		return "celsius", "kmh"
	}
	return "fahrenheit", "mph"
}

type openMeteoClient struct {
	http *http.Client
}

func (c *openMeteoClient) getJSON(ctx context.Context, endpoint string, q url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", endpoint, res.Status)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// coord formats a latitude/longitude for the query string; four decimals is
// ~10m, plenty for a weather grid.
func coord(v float64) string { return fmt.Sprintf("%.4f", v) }

func (c *openMeteoClient) forecast(ctx context.Context, loc location, units string) (forecastData, error) {
	tempUnit, windUnit := unitsParams(units)
	var fc struct {
		Current json.RawMessage `json:"current"`
		Hourly  json.RawMessage `json:"hourly"`
		Daily   json.RawMessage `json:"daily"`
	}
	err := c.getJSON(ctx, forecastAPI, url.Values{
		"latitude":         {coord(loc.Latitude)},
		"longitude":        {coord(loc.Longitude)},
		"current":          {"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"},
		"hourly":           {"temperature_2m,precipitation_probability,weather_code"},
		"daily":            {"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"},
		"forecast_days":    {"6"},
		"forecast_hours":   {"12"},
		"timezone":         {"auto"},
		"temperature_unit": {tempUnit},
		"wind_speed_unit":  {windUnit},
	}, &fc)
	return forecastData{Current: fc.Current, Hourly: fc.Hourly, Daily: fc.Daily}, err
}

func (c *openMeteoClient) airQuality(ctx context.Context, loc location) (*float64, error) {
	var aq struct {
		Current struct {
			USAQI *float64 `json:"us_aqi"`
		} `json:"current"`
	}
	if err := c.getJSON(ctx, airQualityAPI, url.Values{
		"latitude":  {coord(loc.Latitude)},
		"longitude": {coord(loc.Longitude)},
		"current":   {"us_aqi"},
	}, &aq); err != nil {
		return nil, err
	}
	return aq.Current.USAQI, nil
}

func (c *openMeteoClient) geocode(ctx context.Context, query string) ([]geoResult, error) {
	var geo struct {
		Results []struct {
			Name        string  `json:"name"`
			Admin1      string  `json:"admin1"`
			CountryCode string  `json:"country_code"`
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
		} `json:"results"`
	}
	if err := c.getJSON(ctx, geocodingAPI, url.Values{
		"name":  {query},
		"count": {"6"},
	}, &geo); err != nil {
		return nil, err
	}
	out := make([]geoResult, 0, len(geo.Results))
	for _, r := range geo.Results {
		out = append(out, geoResult{
			Name:        r.Name,
			Admin1:      r.Admin1,
			CountryCode: r.CountryCode,
			Latitude:    r.Latitude,
			Longitude:   r.Longitude,
		})
	}
	return out, nil
}
