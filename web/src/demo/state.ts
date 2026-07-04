import type { LayoutItem } from "../types";

// The demo sandbox: the whole "database" as one JSON object in
// localStorage, seeded with the same household the README screenshots
// show. Every visitor gets their own copy; a seed older than RESET_MS
// re-seeds on load, so the demo always comes back to a good state.

export const RESET_MS = 24 * 60 * 60 * 1000;
const KEY = "hearth-demo-state";

export interface DemoView {
  id: number;
  name: string;
  layout: LayoutItem[];
  isDefault: boolean;
  hidden: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
  sortOrder: number;
}

export interface DemoState {
  seededAt: number;
  nextId: number;
  views: DemoView[];
  profiles: { id: number; name: string; color: string }[];
  calendars: { id: number; name: string; color: string; kind: string; enabled: boolean }[];
  events: {
    id: number;
    calendarId: number;
    title: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    location: string;
    notes: string;
  }[];
  groceries: { id: number; name: string; checked: boolean }[];
  chores: {
    id: number;
    title: string;
    everyDays: number;
    lastDone?: string;
    assigneeId?: number;
  }[];
  meds: { id: number; name: string; person: string; profileId?: number; times: string[] }[];
  dosesTaken: string[]; // "medId|slot|windowKey"
  notes: {
    id: number;
    author: string;
    message: string;
    color: string;
    x: number;
    y: number;
    createdAt: string;
  }[];
  meals: { day: string; slot: string; text: string }[];
  settings: {
    guestPin: string;
    guestViewId: number;
    night: { enabled: boolean; start: string; end: string; level: number };
    weather: { name: string; latitude: number; longitude: number };
    units: string;
    onboarded: boolean;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function at(days: number, hhmm: string): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${daysFromNow(days)}T${hhmm}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function seed(): DemoState {
  const cfg = {} as Record<string, unknown>;
  const layout: LayoutItem[] = [
    { i: "clock-1", widget: "clock", x: 0, y: 0, w: 3, h: 3, config: cfg },
    { i: "agenda-1", widget: "agenda", x: 0, y: 3, w: 3, h: 5, config: cfg },
    { i: "calendar-1", widget: "calendar", x: 3, y: 0, w: 6, h: 8, config: cfg },
    { i: "grocery-1", widget: "grocery", x: 9, y: 0, w: 3, h: 4, config: cfg },
    { i: "weather-1", widget: "weather", x: 9, y: 4, w: 3, h: 4, config: cfg },
    { i: "chores-1", widget: "chores", x: 0, y: 8, w: 3, h: 4, config: cfg },
    { i: "meds-1", widget: "meds", x: 3, y: 8, w: 3, h: 4, config: cfg },
    { i: "countdown-1", widget: "countdown", x: 6, y: 8, w: 3, h: 4, config: cfg },
    { i: "guestbook-1", widget: "guestbook", x: 9, y: 8, w: 3, h: 4, config: cfg },
  ];
  return {
    seededAt: Date.now(),
    nextId: 100,
    views: [
      { id: 1, name: "Home", layout, isDefault: true, hidden: false, sortOrder: 1 },
      { id: 2, name: "Kitchen", layout: [], isDefault: false, hidden: false, sortOrder: 2 },
    ],
    profiles: [
      { id: 1, name: "Hannah", color: "#eab308" },
      { id: 2, name: "Zac", color: "#22c55e" },
    ],
    calendars: [
      { id: 1, name: "Family", color: "#D97742", kind: "local", enabled: true },
      { id: 2, name: "Activities", color: "#4f6df5", kind: "local", enabled: true },
    ],
    events: [
      {
        id: 1,
        calendarId: 1,
        title: "Dentist — Hannah",
        startsAt: at(0, "14:00"),
        endsAt: at(0, "15:00"),
        allDay: false,
        location: "",
        notes: "",
      },
      {
        id: 2,
        calendarId: 2,
        title: "Soccer practice",
        startsAt: at(1, "17:30"),
        endsAt: at(1, "18:30"),
        allDay: false,
        location: "",
        notes: "",
      },
      {
        id: 3,
        calendarId: 1,
        title: "Game night",
        startsAt: daysFromNow(2),
        endsAt: daysFromNow(3),
        allDay: true,
        location: "",
        notes: "",
      },
      {
        id: 4,
        calendarId: 2,
        title: "Farmers market",
        startsAt: at(2, "09:00"),
        endsAt: at(2, "10:00"),
        allDay: false,
        location: "",
        notes: "",
      },
      {
        id: 5,
        calendarId: 1,
        title: "Beach week",
        startsAt: daysFromNow(12),
        endsAt: daysFromNow(17),
        allDay: true,
        location: "",
        notes: "book the house #countdown",
      },
      {
        id: 6,
        calendarId: 1,
        title: "Nana & Pop visit",
        startsAt: daysFromNow(23),
        endsAt: daysFromNow(24),
        allDay: true,
        location: "",
        notes: "#countdown",
      },
    ],
    groceries: [
      { id: 1, name: "Eggs", checked: false },
      { id: 2, name: "Sourdough", checked: false },
      { id: 3, name: "Blueberries", checked: false },
      { id: 4, name: "Milk", checked: true },
    ],
    chores: [
      { id: 1, title: "Water plants", everyDays: 3, lastDone: daysFromNow(0) },
      { id: 2, title: "Wash sheets", everyDays: 7 },
      { id: 3, title: "Replace furnace filter", everyDays: 90, assigneeId: 2 },
    ],
    meds: [
      { id: 1, name: "Vitamin D", person: "", profileId: 1, times: ["AM"] },
      { id: 2, name: "Allergy tabs", person: "", profileId: 2, times: ["AM", "PM"] },
    ],
    dosesTaken: [`1|AM|${daysFromNow(0)}`],
    notes: [
      {
        id: 1,
        author: "Grandma",
        message: "Thanks for a wonderful weekend!",
        color: "yellow",
        x: 0.18,
        y: 0.2,
        createdAt: new Date().toISOString(),
      },
    ],
    meals: [
      { day: daysFromNow(0), slot: "dinner", text: "Tacos" },
      { day: daysFromNow(1), slot: "dinner", text: "Salmon & greens" },
      { day: daysFromNow(2), slot: "breakfast", text: "Pancakes" },
    ],
    settings: {
      guestPin: "",
      guestViewId: 0,
      night: { enabled: false, start: "22:00", end: "07:00", level: 0.6 },
      weather: { name: "Boston, Massachusetts (US)", latitude: 42.35843, longitude: -71.05977 },
      units: "imperial",
      onboarded: true,
    },
  };
}

let state: DemoState | null = null;

export function demoState(): DemoState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (Date.now() - parsed.seededAt < RESET_MS) {
        state = parsed;
        return state;
      }
    }
  } catch {
    // corrupted sandbox: fall through to a fresh seed
  }
  state = seed();
  persist();
  return state;
}

export function persist() {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetDemo() {
  state = seed();
  persist();
}

export function demoAge(): number {
  return Date.now() - demoState().seededAt;
}
