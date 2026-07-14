import { publishDemo } from "./bus";
import { demoHeadlines } from "./news";
import { demoGames, demoTeams } from "./sports";
import { type DemoState, demoState, persist, ymd } from "./state";

// Demo mode's backend: the API surface the frontend actually calls,
// implemented over the sandbox state. Semantics mirror internal/server
// and internal/store closely enough that every widget behaves; mutations
// end with publishDemo — publish-on-write, sandbox edition. Weather is
// the one live integration: Open-Meteo allows CORS, so the demo shows
// the visitor's real forecast.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noContent = () => new Response(null, { status: 204 });
const bad = (error: string, status = 400) => json({ error }, status);

const parse = async (init?: RequestInit): Promise<Record<string, unknown>> => {
  if (!init?.body) return {};
  try {
    return JSON.parse(String(init.body));
  } catch {
    return {};
  }
};

const nextId = (s: DemoState) => s.nextId++;

function done(topic?: string, body?: unknown, status = 200): Response {
  persist();
  if (topic) publishDemo(topic);
  return body === undefined ? noContent() : json(body, status);
}

// --- per-concern handlers -------------------------------------------------

function views(s: DemoState, method: string, path: string, body: Record<string, unknown>) {
  const ordered = () =>
    [...s.views]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map(({ sortOrder, ...v }) => v);
  if (method === "GET") return json(ordered());
  if (method === "POST" && path === "") {
    const view = {
      id: nextId(s),
      name: String(body.name ?? ""),
      layout: (body.layout as DemoState["views"][0]["layout"]) ?? [],
      isDefault: false,
      hidden: false,
      sortOrder: Math.max(0, ...s.views.map((v) => v.sortOrder)) + 1,
    };
    s.views.push(view);
    return done("views", view, 201);
  }
  if (method === "PUT" && path === "order") {
    const ids = (body.ids as number[]) ?? [];
    if (ids.length === 0) return bad("ids is required");
    ids.forEach((id, i) => {
      const v = s.views.find((x) => x.id === id);
      if (v) v.sortOrder = i + 1;
    });
    return done("views");
  }
  const m = path.match(/^(\d+)(?:\/(default|guest|schedule|hidden))?$/);
  if (!m) return bad("not found", 404);
  const id = Number(m[1]);
  const view = s.views.find((v) => v.id === id);
  if (!view && !(m[2] === "guest" && id === 0)) return bad("not found", 404);
  switch (m[2]) {
    case "default":
      for (const v of s.views) v.isDefault = v.id === id;
      return done("views");
    case "guest":
      s.settings.guestViewId = id;
      publishDemo("guest");
      return done("views");
    case "hidden":
      if (view) view.hidden = Boolean(body.hidden);
      return done("views");
    case "schedule": {
      const start = String(body.start ?? "");
      const end = String(body.end ?? "");
      const hhmm = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!(start === "" && end === "") && !(hhmm.test(start) && hhmm.test(end))) {
        return bad("start and end must both be HH:MM, or both empty to clear");
      }
      if (view) {
        view.scheduleStart = start || undefined;
        view.scheduleEnd = end || undefined;
      }
      return done("views");
    }
    default:
      if (method === "PUT" && view) {
        view.name = String(body.name ?? view.name);
        view.layout = (body.layout as typeof view.layout) ?? view.layout;
        return done("views", view);
      }
      if (method === "DELETE" && view) {
        if (s.views.length <= 1) return bad("cannot delete the last view");
        s.views = s.views.filter((v) => v.id !== id);
        if (view.isDefault) {
          const survivor = s.views.reduce((a, b) => (a.id < b.id ? a : b));
          survivor.isDefault = true;
        }
        return done("views");
      }
      return bad("not found", 404);
  }
}

function calendarWidget(
  s: DemoState,
  method: string,
  path: string,
  body: Record<string, unknown>,
  url: URL,
) {
  if (path === "google/status") return json({ configured: false, connected: false, email: "" });
  if (path === "google/available") return json([]);
  if (path === "calendars" && method === "GET") return json(s.calendars);
  if (path === "calendars" && method === "POST") {
    const cal = {
      id: nextId(s),
      name: String(body.name ?? ""),
      color: String(body.color ?? "#4f6df5"),
      kind: "local",
      enabled: true,
    };
    s.calendars.push(cal);
    return done("calendar", cal, 201);
  }
  let m = path.match(/^calendars\/(\d+)$/);
  if (m) {
    const cal = s.calendars.find((c) => c.id === Number(m?.[1]));
    if (!cal) return bad("not found", 404);
    if (method === "PUT") {
      Object.assign(cal, {
        name: String(body.name ?? cal.name),
        color: String(body.color ?? cal.color),
        enabled: body.enabled === undefined ? cal.enabled : Boolean(body.enabled),
      });
      return done("calendar", cal);
    }
    if (method === "DELETE") {
      s.calendars = s.calendars.filter((c) => c.id !== cal.id);
      s.events = s.events.filter((e) => e.calendarId !== cal.id);
      return done("calendar");
    }
  }
  if (path === "events" && method === "GET") {
    const start = new Date(url.searchParams.get("start") ?? 0).getTime();
    const end = new Date(url.searchParams.get("end") ?? "2100-01-01").getTime();
    const enabled = new Set(s.calendars.filter((c) => c.enabled).map((c) => c.id));
    return json(
      s.events.filter((e) => {
        if (!enabled.has(e.calendarId)) return false;
        const es = new Date(e.startsAt).getTime();
        const ee = new Date(e.endsAt).getTime();
        return ee >= start && es <= end;
      }),
    );
  }
  const eventDates = (b: Record<string, unknown>) => {
    const allDay = Boolean(b.allDay);
    const startsAt = String(b.startsAt ?? "");
    let endsAt = String(b.endsAt ?? "");
    if (!endsAt) {
      if (allDay) {
        const d = new Date(`${startsAt.slice(0, 10)}T12:00:00`);
        d.setDate(d.getDate() + 1);
        endsAt = ymd(d);
      } else {
        const d = new Date(startsAt);
        d.setHours(d.getHours() + 1);
        endsAt = d.toISOString();
      }
    }
    return { allDay, startsAt, endsAt };
  };
  if (path === "events" && method === "POST") {
    if (!String(body.title ?? "").trim()) return bad("title is required");
    const ev = {
      id: nextId(s),
      calendarId: Number(body.calendarId),
      title: String(body.title).trim(),
      location: String(body.location ?? ""),
      notes: String(body.notes ?? ""),
      ...eventDates(body),
    };
    s.events.push(ev);
    return done("calendar", ev, 201);
  }
  m = path.match(/^events\/(\d+)$/);
  if (m) {
    const ev = s.events.find((e) => e.id === Number(m?.[1]));
    if (!ev) return bad("not found", 404);
    if (method === "PUT") {
      Object.assign(ev, {
        calendarId: Number(body.calendarId ?? ev.calendarId),
        title: String(body.title ?? ev.title).trim(),
        location: String(body.location ?? ev.location),
        notes: String(body.notes ?? ev.notes),
        ...eventDates(body),
      });
      return done("calendar", ev);
    }
    if (method === "DELETE") {
      s.events = s.events.filter((e) => e.id !== ev.id);
      return done("calendar");
    }
  }
  return bad("not found", 404);
}

function choreView(c: DemoState["chores"][0]) {
  const today = ymd(new Date());
  const oneOff = c.everyDays === 0;
  const dueOn = c.lastDone
    ? ymd(new Date(new Date(`${c.lastDone}T12:00:00`).getTime() + c.everyDays * 86400000))
    : today;
  const dueIn = Math.round(
    (new Date(`${dueOn}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000,
  );
  return { ...c, dueOn, dueIn, neverDone: !c.lastDone, oneOff };
}

function chores(s: DemoState, method: string, path: string, body: Record<string, unknown>) {
  if (method === "GET") return json(s.chores.map(choreView));
  if (method === "POST" && path === "") {
    if (!String(body.title ?? "").trim()) return bad("title is required");
    const c = {
      id: nextId(s),
      title: String(body.title).trim(),
      everyDays: Number(body.everyDays ?? 7),
      assigneeId: Number(body.assigneeId) || undefined,
    };
    s.chores.push(c);
    return done("chores", choreView(c), 201);
  }
  let m = path.match(/^(\d+)\/complete$/);
  if (m) {
    const c = s.chores.find((x) => x.id === Number(m?.[1]));
    if (!c) return bad("not found", 404);
    if (c.everyDays === 0) s.chores = s.chores.filter((x) => x.id !== c.id);
    else c.lastDone = ymd(new Date());
    return done("chores", { status: "done" });
  }
  m = path.match(/^(\d+)$/);
  if (m && method === "DELETE") {
    s.chores = s.chores.filter((x) => x.id !== Number(m?.[1]));
    return done("chores");
  }
  return bad("not found", 404);
}

function weekStartMonday(): string {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  now.setDate(now.getDate() - back);
  return ymd(now);
}

function meds(s: DemoState, method: string, path: string, body: Record<string, unknown>) {
  const windowKey = (slot: string) => (slot === "weekly" ? weekStartMonday() : ymd(new Date()));
  if (path === "today") {
    return json({
      day: ymd(new Date()),
      medications: s.meds.map((med) => ({
        ...med,
        doses: med.times.map((slot) => ({
          slot,
          taken: s.dosesTaken.includes(`${med.id}|${slot}|${windowKey(slot)}`),
        })),
      })),
    });
  }
  if (method === "POST" && path === "") {
    if (!String(body.name ?? "").trim()) return bad("name is required");
    const med = {
      id: nextId(s),
      name: String(body.name).trim(),
      person: String(body.person ?? "").trim(),
      profileId: Number(body.profileId) || undefined,
      times: (body.times as string[]) ?? ["daily"],
    };
    s.meds.push(med);
    return done("meds", med, 201);
  }
  let m = path.match(/^(\d+)\/toggle$/);
  if (m) {
    const med = s.meds.find((x) => x.id === Number(m?.[1]));
    if (!med) return bad("not found", 404);
    const slot = String(body.slot ?? "");
    const key = `${med.id}|${slot}|${windowKey(slot)}`;
    const idx = s.dosesTaken.indexOf(key);
    const taken = idx === -1;
    if (taken) s.dosesTaken.push(key);
    else s.dosesTaken.splice(idx, 1);
    return done("meds", { taken });
  }
  m = path.match(/^(\d+)$/);
  if (m && method === "DELETE") {
    s.meds = s.meds.filter((x) => x.id !== Number(m?.[1]));
    return done("meds");
  }
  return bad("not found", 404);
}

function guestbook(s: DemoState, method: string, path: string, body: Record<string, unknown>) {
  if (method === "GET") return json([...s.notes].sort((a, b) => b.id - a.id));
  if (method === "POST" && path === "") {
    const message = String(body.message ?? "").trim();
    if (!message) return bad("message is required");
    if ([...message].length > 280) return bad("keep notes under 280 characters");
    const note = {
      id: nextId(s),
      author: String(body.author ?? "").trim(),
      message,
      color: String(body.color ?? "yellow"),
      x: -1,
      y: -1,
      createdAt: new Date().toISOString(),
    };
    s.notes.push(note);
    return done("guestbook", note, 201);
  }
  let m = path.match(/^(\d+)\/position$/);
  if (m) {
    const note = s.notes.find((n) => n.id === Number(m?.[1]));
    if (!note) return bad("not found", 404);
    const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
    note.x = clamp(Number(body.x));
    note.y = clamp(Number(body.y));
    return done("guestbook");
  }
  m = path.match(/^(\d+)$/);
  if (m && method === "DELETE") {
    s.notes = s.notes.filter((n) => n.id !== Number(m?.[1]));
    return done("guestbook");
  }
  return bad("not found", 404);
}

function mealplan(
  s: DemoState,
  method: string,
  path: string,
  body: Record<string, unknown>,
  url: URL,
) {
  if (path === "week") {
    const start = url.searchParams.get("start") ?? ymd(new Date());
    const end = ymd(new Date(new Date(`${start}T12:00:00`).getTime() + 7 * 86400000));
    return json({ entries: s.meals.filter((e) => e.day >= start && e.day < end) });
  }
  if (path === "entry" && method === "PUT") {
    const day = String(body.day ?? "");
    const slot = String(body.slot ?? "");
    const text = String(body.text ?? "").trim();
    s.meals = s.meals.filter((e) => !(e.day === day && e.slot === slot));
    if (text) s.meals.push({ day, slot, text });
    return done("mealplan", { day, slot, text });
  }
  return bad("not found", 404);
}

// Live Open-Meteo, cached for ten minutes to be polite.
let weatherCache: { at: number; body: unknown } | null = null;
async function weatherForecast(s: DemoState): Promise<Response> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60 * 1000) {
    return json(weatherCache.body);
  }
  const loc = s.settings.weather;
  const units = s.settings.units;
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  try {
    const [fc, aq] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?${q({
          latitude: loc.latitude.toFixed(4),
          longitude: loc.longitude.toFixed(4),
          current:
            "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
          hourly: "temperature_2m,precipitation_probability,weather_code",
          daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
          forecast_days: "6",
          forecast_hours: "12",
          timezone: "auto",
          temperature_unit: units === "metric" ? "celsius" : "fahrenheit",
          wind_speed_unit: units === "metric" ? "kmh" : "mph",
        })}`,
      ).then((r) => r.json()),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?${q({
          latitude: loc.latitude.toFixed(4),
          longitude: loc.longitude.toFixed(4),
          current:
            "us_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
        })}`,
      )
        .then((r) => r.json())
        .catch(() => null),
    ]);
    // Mirror the backend's species → category grouping (worst species wins);
    // outside pollen coverage everything is null and the block collapses.
    const worst = (...vs: (number | null | undefined)[]) =>
      vs.reduce<number | null>((m, v) => (v != null && (m == null || v > m) ? v : m), null);
    const pollen = {
      tree: worst(aq?.current?.alder_pollen, aq?.current?.birch_pollen, aq?.current?.olive_pollen),
      grass: worst(aq?.current?.grass_pollen),
      weed: worst(aq?.current?.mugwort_pollen, aq?.current?.ragweed_pollen),
    };
    const body = {
      configured: true,
      forecast: {
        location: { name: loc.name },
        units,
        usAqi: aq?.current?.us_aqi ?? null,
        pollen: pollen.tree == null && pollen.grass == null && pollen.weed == null ? null : pollen,
        current: fc.current,
        hourly: fc.hourly,
        daily: fc.daily,
      },
    };
    weatherCache = { at: Date.now(), body };
    return json(body);
  } catch {
    return json({ configured: true, pending: true });
  }
}

async function weather(
  s: DemoState,
  method: string,
  path: string,
  body: Record<string, unknown>,
  url: URL,
) {
  if (path === "forecast") return weatherForecast(s);
  if (path === "geocode") {
    const query = url.searchParams.get("q") ?? "";
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5`,
      ).then((r) => r.json());
      interface Geo {
        name: string;
        admin1?: string;
        country_code?: string;
        latitude: number;
        longitude: number;
      }
      return json(
        ((res.results ?? []) as Geo[]).map((g) => ({
          name: [g.name, g.admin1, g.country_code ? `(${g.country_code})` : ""]
            .filter(Boolean)
            .join(", ")
            .replace(", (", " ("),
          latitude: g.latitude,
          longitude: g.longitude,
        })),
      );
    } catch {
      return json([]);
    }
  }
  if (path === "location" && method === "PUT") {
    s.settings.weather = {
      name: String(body.name ?? ""),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
    };
    weatherCache = null;
    return done("weather", { status: "ok" });
  }
  if (path === "units" && method === "PUT") {
    s.settings.units = String(body.units ?? "imperial");
    weatherCache = null;
    return done("weather", { status: "ok" });
  }
  return bad("not found", 404);
}

// --- the router -------------------------------------------------------------

export async function demoFetch(path: string, init?: RequestInit): Promise<Response> {
  const s = demoState();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://demo.local");
  const body = await parse(init);
  const p = url.pathname;

  if (p === "/api/views" || p.startsWith("/api/views/")) {
    return views(s, method, p.replace(/^\/api\/views\/?/, ""), body);
  }
  if (p === "/api/guest") {
    return json({ pinSet: s.settings.guestPin !== "", guestViewId: s.settings.guestViewId });
  }
  if (p === "/api/guest/pin") {
    const pin = String(body.pin ?? "");
    if (s.settings.guestPin && String(body.currentPin ?? "") !== s.settings.guestPin) {
      return bad("current PIN is incorrect", 403);
    }
    if (pin !== "" && pin.length < 4) return bad("PIN must be at least 4 characters");
    s.settings.guestPin = pin;
    return done("guest", { status: "ok" });
  }
  if (p === "/api/guest/verify") {
    if (!s.settings.guestPin || String(body.pin ?? "") === s.settings.guestPin) {
      return json({ status: "ok" });
    }
    return bad("incorrect PIN", 403);
  }
  if (p === "/api/night") {
    if (method === "GET") return json(s.settings.night);
    const level = Number(body.level);
    if (level < 0.2 || level > 0.85) return bad("level must be between 0.2 and 0.85");
    s.settings.night = {
      enabled: Boolean(body.enabled),
      start: String(body.start),
      end: String(body.end),
      level,
    };
    return done("night", s.settings.night);
  }
  if (p === "/api/onboarding") {
    if (method === "GET") return json({ needed: !s.settings.onboarded });
    s.settings.onboarded = true;
    return done("views", { needed: false });
  }
  if (p === "/api/profiles" || p.startsWith("/api/profiles/")) {
    const sub = p.replace(/^\/api\/profiles\/?/, "");
    if (method === "GET") return json(s.profiles);
    if (method === "POST") {
      const name = String(body.name ?? "").trim();
      if (!name) return bad("name is required; color must be #RRGGBB");
      const prof = { id: nextId(s), name, color: String(body.color ?? "#D97742") };
      s.profiles.push(prof);
      return done("profiles", prof, 201);
    }
    const id = Number(sub);
    const prof = s.profiles.find((x) => x.id === id);
    if (!prof) return bad("not found", 404);
    if (method === "PUT") {
      prof.name = String(body.name ?? prof.name).trim();
      prof.color = String(body.color ?? prof.color);
      return done("profiles");
    }
    if (method === "DELETE") {
      s.profiles = s.profiles.filter((x) => x.id !== id);
      for (const c of s.chores) if (c.assigneeId === id) c.assigneeId = undefined;
      for (const m of s.meds) if (m.profileId === id) m.profileId = undefined;
      publishDemo("chores");
      publishDemo("meds");
      return done("profiles");
    }
  }
  if (p === "/api/widgets/clock/now") {
    return json({
      now: new Date().toISOString(),
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  const widget = p.match(/^\/api\/widgets\/([a-z]+)\/?(.*)$/);
  if (widget) {
    const sub = widget[2];
    switch (widget[1]) {
      case "calendar":
        return calendarWidget(s, method, sub, body, url);
      case "chores":
        return chores(s, method, sub, body);
      case "grocery": {
        if (method === "GET") return json(s.groceries);
        if (sub === "" && method === "POST") {
          const name = String(body.name ?? "").trim();
          if (!name) return bad("name is required");
          const item = { id: nextId(s), name, checked: false };
          s.groceries.push(item);
          return done("grocery", item, 201);
        }
        if (sub === "clear-checked") {
          s.groceries = s.groceries.filter((g) => !g.checked);
          return done("grocery", { status: "ok" });
        }
        const toggle = sub.match(/^(\d+)\/toggle$/);
        if (toggle) {
          const item = s.groceries.find((g) => g.id === Number(toggle[1]));
          if (!item) return bad("not found", 404);
          item.checked = !item.checked;
          return done("grocery", item);
        }
        const del = sub.match(/^(\d+)$/);
        if (del && method === "DELETE") {
          s.groceries = s.groceries.filter((g) => g.id !== Number(del[1]));
          return done("grocery");
        }
        return bad("not found", 404);
      }
      case "meds":
        return meds(s, method, sub, body);
      case "guestbook":
        return guestbook(s, method, sub, body);
      case "mealplan":
        return mealplan(s, method, sub, body, url);
      case "weather":
        return weather(s, method, sub, body, url);
      case "sports": {
        const league = url.searchParams.get("league") ?? "";
        if (sub === "teams" && method === "GET") {
          const teams = demoTeams(league);
          return teams ? json(teams) : bad("unknown league");
        }
        if (sub === "games" && method === "GET") {
          const games = demoGames(league, url.searchParams.get("team") ?? "");
          return games ? json(games) : bad("unknown league or team");
        }
        return bad("not found", 404);
      }
      case "news": {
        if (sub === "headlines" && method === "GET") {
          const headlines = demoHeadlines(url.searchParams.get("topic") ?? "");
          return headlines ? json(headlines) : bad("unknown topic");
        }
        return bad("not found", 404);
      }
    }
  }

  if (p === "/api/backup") return bad("backups need a real server — this is the demo", 501);
  return bad(`demo: unhandled ${method} ${p}`, 404);
}
