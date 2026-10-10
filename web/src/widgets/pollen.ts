// Pure helpers for the weather widget's pollen line. Counts come in grains/m³ per
// category (internal/widgets/weather groups the species). Severity bands follow the
// National Allergy Bureau scale, with different thresholds per category.

import type { PollenCounts } from "./weatherApi";

export type PollenLevel = "low" | "moderate" | "high" | "very high";

// Lower bounds of [moderate, high, very high) per category. Below the first band is
// "low". Zero is real data: a low reading, not an absence.
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

// "Tree high · Grass low". Categories without data are left out, so outside pollen
// coverage the widget shows no pollen line.
export function pollenSummary(p: PollenCounts | null | undefined): string {
  if (!p) return "";
  return (Object.keys(LABELS) as (keyof PollenCounts)[])
    .filter((k) => p[k] != null)
    .map((k) => `${LABELS[k]} ${pollenLevel(k, p[k] as number)}`)
    .join(" · ");
}
