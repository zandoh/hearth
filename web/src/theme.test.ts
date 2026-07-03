import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Brand guard: "warm neutrals do the work; ember is the only voice of
// color." The theme's color scale generates unlisted tokens from the ember
// accent, which once tinted every neutral surface brown. This test parses
// the BUILT theme and fails if any neutral-role token smuggles in warm
// saturation, so the brown can never come back unnoticed.

const NEUTRAL_ROLE = new RegExp(
  "^--color-(" +
    [
      "neutral",
      "overlay(-hover|-pressed)?",
      "icon-(primary|secondary|disabled)",
      "skeleton",
      "track",
      "tint-hover",
      "background-(body|surface|card|muted|popover|inverted)",
      "text-(primary|secondary|disabled|placeholder)",
      "border(-emphasized)?",
    ].join("|") +
    ")$",
);

// The brand's own neutrals: Char, Iron, Stone, Paper (any alpha), plus
// pure black/white.
const BRAND_NEUTRALS = new Set(["1b1916", "4a4740", "c9c3b8", "f4f1eb", "ffffff", "000000"]);

function saturation(hex: string): number {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  h = h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

const rgb6 = (hex: string) => {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  return h.slice(0, 6);
};

describe("hearth theme brand guard", () => {
  const css = readFileSync(join(import.meta.dir, "theme.css"), "utf8");
  const decls = [...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)];

  test("theme.css exists and has tokens", () => {
    expect(decls.length).toBeGreaterThan(50);
  });

  test("neutral-role tokens carry no warm tint", () => {
    const offenders: string[] = [];
    for (const [, name, value] of decls) {
      if (!NEUTRAL_ROLE.test(name)) continue;
      for (const hex of value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        if (BRAND_NEUTRALS.has(rgb6(hex))) continue;
        if (saturation(hex) > 0.12) {
          offenders.push(`${name}: ${hex} (saturation ${saturation(hex).toFixed(2)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("ember stays the accent", () => {
    const accent = decls.find(([, n]) => n === "--color-accent");
    expect(accent?.[2]?.toLowerCase()).toContain("#d97742");
  });
});
