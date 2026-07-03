// Re-shoot the README hero screenshots (docs/board-light.png and
// docs/board-dark.png) against the current build: boots a fresh hearth
// binary with a throwaway database, seeds the demo household, and captures
// both color schemes at 1600x1000.
//
//   make build && bun e2e/shoot.mjs
//
// Run this whenever the theme or the board's look changes, then commit the
// PNGs — the README serves them via <picture> prefers-color-scheme.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const BIN = process.env.HEARTH_BIN ?? join(here, "..", "..", "bin", "hearth");
const OUT = process.env.HEARTH_SHOOT_OUT ?? join(here, "..", "..", "docs");
const PORT = Number(process.env.HEARTH_SHOOT_PORT ?? 8198);
const BASE = `http://localhost:${PORT}`;

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
};
const put = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

/** Local YYYY-MM-DD, `days` from today. */
function ymd(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** RFC3339 with the local offset, at HH:MM on `days` from today. */
function at(days, hhmm) {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const pad = (n) => String(n).padStart(2, "0");
  const abs = Math.abs(off);
  return `${ymd(days)}T${hhmm}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

async function seed(dbPath) {
  // The board: clock + agenda down the left, calendar center, groceries and
  // countdown right, chores/meds/guest book across the bottom.
  await put("/api/views/1", {
    name: "Home",
    layout: [
      { i: "clock-1", widget: "clock", x: 0, y: 0, w: 3, h: 3, config: {} },
      { i: "agenda-1", widget: "agenda", x: 0, y: 3, w: 3, h: 5, config: {} },
      { i: "calendar-1", widget: "calendar", x: 3, y: 0, w: 6, h: 8, config: {} },
      { i: "grocery-1", widget: "grocery", x: 9, y: 0, w: 3, h: 4, config: {} },
      { i: "countdown-1", widget: "countdown", x: 9, y: 4, w: 3, h: 4, config: {} },
      { i: "chores-1", widget: "chores", x: 0, y: 8, w: 4, h: 4, config: {} },
      { i: "meds-1", widget: "meds", x: 4, y: 8, w: 4, h: 4, config: {} },
      { i: "guestbook-1", widget: "guestbook", x: 8, y: 8, w: 4, h: 4, config: {} },
    ],
  });
  await post("/api/views", { name: "Kitchen", layout: [] });

  // Household profiles: avatars on chores and meds.
  const hannah = await post("/api/profiles", { name: "Hannah", color: "#eab308" });
  const zac = await post("/api/profiles", { name: "Zac", color: "#22c55e" });

  const family = await post("/api/widgets/calendar/calendars", {
    name: "Family",
    color: "#D97742",
  });
  const activities = await post("/api/widgets/calendar/calendars", {
    name: "Activities",
    color: "#4f6df5",
  });
  await post("/api/widgets/calendar/events", {
    calendarId: family.id,
    title: "Dentist — Hannah",
    startsAt: at(0, "14:00"),
    allDay: false,
  });
  await post("/api/widgets/calendar/events", {
    calendarId: activities.id,
    title: "Soccer practice",
    startsAt: at(1, "17:30"),
    allDay: false,
  });
  await post("/api/widgets/calendar/events", {
    calendarId: family.id,
    title: "Game night",
    startsAt: ymd(2),
    allDay: true,
  });
  await post("/api/widgets/calendar/events", {
    calendarId: activities.id,
    title: "Farmers market",
    startsAt: at(2, "09:00"),
    allDay: false,
  });
  // Tagged events feed the countdown widget.
  await post("/api/widgets/calendar/events", {
    calendarId: family.id,
    title: "Beach week",
    startsAt: ymd(12),
    allDay: true,
    notes: "book the house #countdown",
  });
  await post("/api/widgets/calendar/events", {
    calendarId: family.id,
    title: "Nana & Pop visit",
    startsAt: ymd(23),
    allDay: true,
    notes: "#countdown",
  });

  for (const name of ["Eggs", "Sourdough", "Blueberries"]) {
    await post("/api/widgets/grocery", { name });
  }
  const milk = await post("/api/widgets/grocery", { name: "Milk" });
  await post(`/api/widgets/grocery/${milk.id}/toggle`);

  // The store seeds "Water plants" (3d) and "Wash sheets" (7d), both
  // never-done (due today). Add one long-cadence chore, then mark Water
  // plants done today so the board shows a mix of due-today and upcoming.
  await post("/api/widgets/chores", {
    title: "Replace furnace filter",
    everyDays: 90,
    assigneeId: zac.id,
  });
  execFileSync("sqlite3", [
    dbPath,
    "UPDATE chores SET last_done = date('now','localtime') WHERE title = 'Water plants'",
  ]);

  const vitd = await post("/api/widgets/meds", {
    name: "Vitamin D",
    profileId: hannah.id,
    times: ["AM"],
  });
  await post("/api/widgets/meds", { name: "Allergy tabs", profileId: zac.id, times: ["AM", "PM"] });
  await post(`/api/widgets/meds/${vitd.id}/toggle`, { slot: "AM" });

  // A note on the guest book wall.
  const note = await post("/api/widgets/guestbook", {
    author: "Grandma",
    message: "Thanks for a wonderful weekend!",
    color: "yellow",
  });
  await fetch(`${BASE}/api/widgets/guestbook/${note.id}/position`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 0.18, y: 0.2 }),
  });
}

async function shoot(browser, colorScheme, path) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    colorScheme,
  });
  await page.goto(BASE);
  await page.waitForSelector(".widget-card");
  await page.waitForSelector("text=Dentist — Hannah");
  await page.waitForSelector("text=Sourdough");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800); // let the grid and SSE-driven fetches settle
  await page.screenshot({ path });
  await page.close();
  console.log(`shot ${colorScheme} -> ${path}`);
}

const dir = mkdtempSync(join(tmpdir(), "hearth-shoot-"));
const dbPath = join(dir, "shoot.db");
const server = spawn(BIN, ["-addr", `:${PORT}`, "-db", dbPath], { stdio: "ignore" });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/api/healthz`)).ok) break;
    } catch {
      if (i > 50) throw new Error("server did not become healthy");
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await seed(dbPath);
  const browser = await chromium.launch();
  await shoot(browser, "dark", join(OUT, "board-dark.png"));
  await shoot(browser, "light", join(OUT, "board-light.png"));
  await browser.close();
} finally {
  server.kill();
}
