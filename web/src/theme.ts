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
    // (light, dark). Dark mode is OLED near-black: a bottomless neutral
    // body with clearly lifted neutral cards — chosen over warm Char after
    // on-board comparison; ember reads hotter against the void, and warmth
    // stays where the brand wants it: in ember alone. Light mode keeps the
    // Paper/Char doc palette.
    "--color-background-body": ["#F4F1EB", "#0C0C0C"], // Paper / near-black
    "--color-background-surface": ["#FFFFFF", "#1B1B1B"],
    "--color-background-card": ["#FFFFFF", "#1B1B1B"],
    "--color-background-muted": ["#1B19160D", "#FFFFFF0F"],
    "--color-text-primary": ["#1B1916", "#F4F1EB"], // Char / Paper
    "--color-text-secondary": ["#4A4740", "#ABABA6"], // Iron / neutral grey
    "--color-border": ["#C9C3B84D", "#FFFFFF14"],
    "--color-border-emphasized": ["#C9C3B8", "#3A3A3A"], // Stone / graphite
    "--color-accent": ["#D97742", "#D97742"], // Ember, accent only
    "--color-accent-muted": ["#D9774233", "#E8A87C3F"], // glow tints
    "--color-on-accent": ["#FFFFFF", "#1B1916"],
    // The color scale derives unlisted tokens from the ember hue, which
    // turns neutral ROLES brown. Pin every neutral role to the brand's
    // actual neutrals (guarded by theme.test.ts).
    "--color-neutral": ["#1B191614", "#FFFFFF1F"],
    "--color-overlay": ["#1B191666", "#000000A6"],
    "--color-overlay-hover": ["#1B19160C", "#FFFFFF0C"],
    "--color-overlay-pressed": ["#1B191619", "#FFFFFF17"],
    "--color-icon-primary": ["#1B1916", "#F4F1EB"],
    "--color-icon-secondary": ["#4A4740", "#ABABA6"],
    "--color-background-popover": ["#FFFFFF", "#222222"],
    "--color-background-inverted": ["#1B1916", "#F4F1EB"],
    "--color-skeleton": ["#C9C3B8", "#3A3A3A"],
    "--color-track": ["#C9C3B8", "#3A3A3A"],
  },
});

// Source of truth for `bun run theme:build`, which generates theme.css and
// hearth.js — the app imports the generated pair, never this file directly.
export const hearthTheme = theme;
