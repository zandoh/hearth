import type { ComponentType } from "react";
import type { LayoutItem } from "../types";
import { AgendaSettings, AgendaWidget } from "./AgendaWidget";
import { CalendarWidget } from "./CalendarWidget";
import { ChoresWidget } from "./ChoresWidget";
import { ClockSettings, ClockWidget } from "./ClockWidget";
import { GroceryWidget } from "./GroceryWidget";
import { MedsWidget } from "./MedsWidget";
import { WeatherSettings, WeatherWidget } from "./WeatherWidget";

// Client half of the widget contract. Every backend widget slug maps to a
// component here; the grid renders a placeholder for anything unknown.

export interface WidgetProps {
  item: LayoutItem;
  // Persist this instance's config (merged into the layout item). Widgets
  // use it for remembered UI state like the calendar's active view mode.
  saveConfig?: (config: Record<string, unknown>) => void;
}

// Per-instance settings form, opened from the gear in the widget's chrome
// bar (edit mode). It renders its fields plus its own Save action, calling
// `save` with the new config — the platform persists it into the layout
// item and closes the dialog.
export interface WidgetSettingsProps {
  config: Record<string, unknown>;
  save: (config: Record<string, unknown>) => void;
}

export interface WidgetDef {
  title: string;
  component: ComponentType<WidgetProps>;
  // Grid units used when the widget is first added to a view.
  defaultSize: { w: number; h: number };
  // Optional per-instance settings dialog body.
  settings?: ComponentType<WidgetSettingsProps>;
}

export const widgetRegistry: Record<string, WidgetDef> = {
  clock: {
    title: "Clock",
    component: ClockWidget,
    defaultSize: { w: 4, h: 3 },
    settings: ClockSettings,
  },
  calendar: {
    title: "Calendar",
    component: CalendarWidget,
    defaultSize: { w: 6, h: 6 },
  },
  agenda: {
    title: "Agenda",
    component: AgendaWidget,
    defaultSize: { w: 3, h: 5 },
    settings: AgendaSettings,
  },
  chores: {
    title: "Chores",
    component: ChoresWidget,
    defaultSize: { w: 3, h: 4 },
  },
  grocery: {
    title: "Groceries",
    component: GroceryWidget,
    defaultSize: { w: 3, h: 5 },
  },
  meds: {
    title: "Medications",
    component: MedsWidget,
    defaultSize: { w: 4, h: 4 },
  },
  weather: {
    title: "Weather",
    component: WeatherWidget,
    defaultSize: { w: 4, h: 5 },
    settings: WeatherSettings,
  },
};
