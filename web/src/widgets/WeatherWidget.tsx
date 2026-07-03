import { useCallback, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";

// WMO weather interpretation codes → label + emoji.
const WMO: Record<number, [string, string]> = {
  0: ["Clear", "☀️"],
  1: ["Mostly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "❄️"],
  80: ["Showers", "🌦️"],
  81: ["Showers", "🌧️"],
  82: ["Heavy showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Snow showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm w/ hail", "⛈️"],
  99: ["Thunderstorm w/ hail", "⛈️"],
};

const wmo = (code: number): [string, string] => WMO[code] ?? ["—", "•"];

function aqiBadge(aqi: number) {
  if (aqi <= 50) return <Badge variant="neutral" label={`AQI ${aqi}`} />;
  if (aqi <= 100) return <Badge variant="warning" label={`AQI ${aqi} moderate`} />;
  return <Badge variant="error" label={`AQI ${aqi} unhealthy`} />;
}

interface Forecast {
  location: { name: string };
  usAqi: number | null;
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

interface ForecastResponse {
  configured: boolean;
  pending?: boolean;
  forecast?: Forecast;
}

interface Candidate {
  name: string;
  latitude: number;
  longitude: number;
}

const api = "/api/widgets/weather";

export function WeatherWidget(_props: WidgetProps) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    fetch(`${api}/forecast`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(reload, [reload]);
  useTopic("weather", reload);

  const search = async () => {
    if (!query.trim()) return;
    setError("");
    setCandidates(null);
    const res = await fetch(`${api}/geocode?q=${encodeURIComponent(query.trim())}`);
    const found = res.ok ? ((await res.json()) as Candidate[]) : [];
    if (found.length === 0) {
      setError(`no places found for "${query}"`);
      return;
    }
    setCandidates(found);
  };

  const choose = async (c: Candidate) => {
    setError("");
    const res = await fetch(`${api}/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "failed to set location");
      return;
    }
    setCandidates(null);
  };

  if (!data) {
    return (
      <VStack className="widget-body" justify="center" align="center">
        <Text type="supporting">Loading…</Text>
      </VStack>
    );
  }

  if (!data.configured || !data.forecast) {
    return (
      <VStack className="widget-body" gap={2}>
        {data.configured && !candidates ? (
          <Text type="supporting">Fetching forecast…</Text>
        ) : (
          <>
            <Text type="supporting">Set your location:</Text>
            <HStack gap={2} align="end">
              <TextInput
                label="Location"
                isLabelHidden
                placeholder="e.g. Richmond"
                value={query}
                onChange={(v) => setQuery(v)}
                onEnter={search}
                className="min-w-0 flex-1"
              />
              <Button size="sm" variant="primary" label="Search" onClick={search} />
            </HStack>
            {candidates && (
              <VStack as="ul" gap={1.5} className="plain-list">
                {candidates.map((c) => (
                  <li key={`${c.latitude},${c.longitude}`}>
                    <button className="weather-candidate no-drag" onClick={() => choose(c)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </VStack>
            )}
            {error && <Text className="form-error">{error}</Text>}
          </>
        )}
      </VStack>
    );
  }

  const f = data.forecast;
  const [condition, icon] = wmo(f.current.weather_code);
  const hourly = f.hourly.time.slice(0, 12);

  return (
    <VStack className="widget-body" gap={3}>
      <HStack gap={3} align="center">
        <span className="weather-icon">{icon}</span>
        <Text type="display-2" hasTabularNumbers>
          {Math.round(f.current.temperature_2m)}°
        </Text>
        <VStack gap={0.5} className="min-w-0">
          <Text weight="semibold">{condition}</Text>
          <Text type="supporting" size="xsm" maxLines={1}>
            feels {Math.round(f.current.apparent_temperature)}° · {f.location.name}
          </Text>
          {f.usAqi != null && <HStack>{aqiBadge(Math.round(f.usAqi))}</HStack>}
        </VStack>
      </HStack>

      <div className="weather-hourly">
        {hourly.map((t, i) => (
          <div key={t} className="weather-hour">
            <span>{new Date(t).toLocaleTimeString([], { hour: "numeric" })}</span>
            <span>{wmo(f.hourly.weather_code[i])[1]}</span>
            <span>{Math.round(f.hourly.temperature_2m[i])}°</span>
            <span className="weather-precip">
              {f.hourly.precipitation_probability[i] > 10
                ? `${f.hourly.precipitation_probability[i]}%`
                : ""}
            </span>
          </div>
        ))}
      </div>

      <VStack gap={1}>
        {f.daily.time.slice(1).map((t, i) => {
          const idx = i + 1;
          return (
            <HStack key={t} gap={2} align="center">
              <Text type="supporting" className="w-11">
                {new Date(`${t}T12:00:00`).toLocaleDateString([], { weekday: "short" })}
              </Text>
              <span>{wmo(f.daily.weather_code[idx])[1]}</span>
              <Text hasTabularNumbers className="ml-auto">
                {Math.round(f.daily.temperature_2m_min[idx])}°–
                {Math.round(f.daily.temperature_2m_max[idx])}°
              </Text>
            </HStack>
          );
        })}
      </VStack>
    </VStack>
  );
}
