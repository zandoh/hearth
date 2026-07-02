import type { ComponentType } from "react";
import type { LayoutItem } from "../types";
import { AgendaWidget } from "./AgendaWidget";
import { CalendarWidget } from "./CalendarWidget";
import { ChoresWidget } from "./ChoresWidget";
import { ClockWidget } from "./ClockWidget";
import { GroceryWidget } from "./GroceryWidget";
import { MedsWidget } from "./MedsWidget";
import { WeatherWidget } from "./WeatherWidget";

// Client half of the widget contract. Every backend widget slug maps to a
// component here; the grid renders a placeholder for anything unknown.

export interface WidgetProps {
  item: LayoutItem;
}

export interface WidgetDef {
  title: string;
  component: ComponentType<WidgetProps>;
  // Grid units used when the widget is first added to a view.
  defaultSize: { w: number; h: number };
}

export const widgetRegistry: Record<string, WidgetDef> = {
  clock: {
    title: "Clock",
    component: ClockWidget,
    defaultSize: { w: 4, h: 3 },
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
  },
};
