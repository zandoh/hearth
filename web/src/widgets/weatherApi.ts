// API client + types for the weather widget's backend
// (internal/widgets/weather). Go structs are the source of truth.

import { apiFetch } from "../api";

// Current counts in grains/m³; null per category (or as a whole) where
// Open-Meteo has no pollen data.
export interface PollenCounts {
  tree: number | null;
  grass: number | null;
  weed: number | null;
}

export interface Forecast {
  location: { name: string };
  units: "imperial" | "metric";
  usAqi: number | null;
  pollen: PollenCounts | null;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

export interface ForecastResponse {
  configured: boolean;
  pending?: boolean;
  forecast?: Forecast;
}

export interface Candidate {
  name: string;
  latitude: number;
  longitude: number;
}

const base = "/api/widgets/weather";

const call = <T>(path: string, init?: RequestInit) => apiFetch<T>(base + path, init);

export const getForecast = () => call<ForecastResponse>("/forecast");

export const geocode = (q: string) => call<Candidate[]>(`/geocode?q=${encodeURIComponent(q)}`);

export const saveLocation = (c: Candidate) =>
  call<void>("/location", { method: "PUT", body: JSON.stringify(c) });

export const saveUnits = (units: string) =>
  call<void>("/units", { method: "PUT", body: JSON.stringify({ units }) });
