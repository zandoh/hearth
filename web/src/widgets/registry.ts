import type { ComponentType } from "react";
import type { LayoutItem } from "../types";
import { ClockWidget } from "./ClockWidget";

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
};
