import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Hearth brand (Brand Guidelines v1.0): warm neutrals do the work, ember is
// the only voice of color — and the ONLY warm thing on screen. Dark mode
// anchors on Char with near-neutral lifts and Paper-alpha overlays; Iron
// and Stone take the doc's stated roles (secondary text, borders/muted).
// Space Grotesk carries the voice, IBM Plex Mono carries the data.
const theme = defineTheme({
  name: "hearth",
  extends: neutralTheme,
  color: { accent: "#D97742" },
  typography: {
    body: { family: "Space Grotesk", fallbacks: "system-ui, sans-serif" },
    heading: { family: "Space Grotesk", fallbacks: "system-ui, sans-serif" },
    code: { family: "IBM Plex Mono", fallbacks: "ui-monospace, monospace" },
  },
  tokens: {
    // (light, dark)
    "--color-background-body": ["#F4F1EB", "#1B1916"], // Paper / Char
    "--color-background-surface": ["#FFFFFF", "#201E1C"],
    "--color-background-card": ["#FFFFFF", "#201E1C"],
    "--color-background-muted": ["#1B19160D", "#F4F1EB0F"],
    "--color-text-primary": ["#1B1916", "#F4F1EB"], // Char / Paper
    "--color-text-secondary": ["#4A4740", "#C9C3B8"], // Iron / Stone
    "--color-border": ["#C9C3B84D", "#F4F1EB1A"],
    "--color-border-emphasized": ["#C9C3B8", "#4A4740"], // Stone / Iron
    "--color-accent": ["#D97742", "#D97742"], // Ember, accent only
    "--color-accent-muted": ["#D9774233", "#E8A87C3F"], // glow tints
    "--color-on-accent": ["#FFFFFF", "#1B1916"],
    // The color scale derives unlisted tokens from the ember hue, which
    // turns neutral ROLES brown. Pin every neutral role to the brand's
    // actual neutrals (guarded by theme.test.ts).
    "--color-neutral": ["#1B191614", "#F4F1EB21"],
    "--color-overlay": ["#1B191666", "#000000A6"],
    "--color-overlay-hover": ["#1B19160C", "#F4F1EB0C"],
    "--color-overlay-pressed": ["#1B191619", "#F4F1EB19"],
    "--color-icon-primary": ["#1B1916", "#F4F1EB"],
    "--color-icon-secondary": ["#4A4740", "#C9C3B8"],
    "--color-background-popover": ["#FFFFFF", "#242220"],
    "--color-background-inverted": ["#1B1916", "#F4F1EB"],
    "--color-skeleton": ["#C9C3B8", "#4A4740"],
    "--color-track": ["#C9C3B8", "#4A4740"],
  },
});

// Marked pre-built: styles come from ./theme.css (regenerate with
// `bun run theme:build` after editing this file).
export const hearthTheme = Object.assign(theme, { __built: true });
