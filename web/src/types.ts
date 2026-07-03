// Mirrors the Go API types in internal/store. The Go structs are the
// source of truth; keep this file in sync when the API changes.

export interface LayoutItem {
  i: string;
  widget: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface View {
  id: number;
  name: string;
  layout: LayoutItem[];
  isDefault: boolean;
  hidden: boolean;
  scheduleStart?: string; // HH:MM daily window; see kiosk.scheduledViewID
  scheduleEnd?: string;
}
