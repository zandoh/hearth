// Pure helpers for the weather widget's pollen line. Counts arrive in
// grains/m³ by category (internal/widgets/weather groups the species);
// severity bands follow the National Allergy Bureau scale, which sets
// different thresholds per category.

import type { PollenCounts } from "./weatherApi";

export type PollenLevel = "low" | "moderate" | "high" | "very high";

// [moderate, high, very high) lower bounds per category; below the first
// band is "low". Zero is real data — a low reading, not an absence.
const BANDS: Record<keyof PollenCounts, [number, number, number]> = {
  tree: [15, 90, 1500],
  grass: [5, 20, 200],
  weed: [10, 50, 500],
};

export function pollenLevel(kind: keyof PollenCounts, count: number): PollenLevel {
  const [moderate, high, veryHigh] = BANDS[kind];
  if (count >= veryHigh) return "very high";
  if (count >= high) return "high";
  if (count >= moderate) return "moderate";
  return "low";
}

const LABELS: Record<keyof PollenCounts, string> = {
  tree: "Tree",
  grass: "Grass",
  weed: "Weed",
};

// "Tree high · Grass low" — categories with no data are simply omitted, so
// outside pollen coverage the widget shows no pollen line at all.
export function pollenSummary(p: PollenCounts | null | undefined): string {
  if (!p) return "";
  return (Object.keys(LABELS) as (keyof PollenCounts)[])
    .filter((k) => p[k] != null)
    .map((k) => `${LABELS[k]} ${pollenLevel(k, p[k] as number)}`)
    .join(" · ");
}
