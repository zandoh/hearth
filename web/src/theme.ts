import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

// Hearth brand (Brand Guidelines v1.0): warm neutrals do the work, ember is
// the only voice of color. Char/Paper anchor the dark and light backgrounds;
// ember never exceeds small accents. Space Grotesk carries the voice,
// IBM Plex Mono carries the data.
export const hearthTheme = defineTheme({
  name: "hearth",
  extends: neutralTheme,
  color: { accent: "#D97742", neutralStyle: "warm" },
  typography: {
    body: { family: "Space Grotesk", fallbacks: "system-ui, sans-serif" },
    heading: { family: "Space Grotesk", fallbacks: "system-ui, sans-serif" },
    code: { family: "IBM Plex Mono", fallbacks: "ui-monospace, monospace" },
  },
  tokens: {
    // Brand-exact anchors (light, dark): Paper / Char backgrounds,
    // Char / Paper text, Stone-derived borders, Ember accent with the
    // ember-glow reserved for hover/active tints.
    "--color-background-body": ["#F4F1EB", "#1B1916"],
    "--color-background-surface": ["#FFFFFF", "#242019"],
    "--color-background-card": ["#FFFFFF", "#242019"],
    "--color-text-primary": ["#1B1916", "#F4F1EB"],
    "--color-text-secondary": ["#4A4740", "#C9C3B8"],
    "--color-border": ["#C9C3B84D", "#C9C3B826"],
    "--color-border-emphasized": ["#C9C3B8", "#4A4740"],
    "--color-accent": ["#D97742", "#D97742"],
    "--color-accent-muted": ["#D9774233", "#E8A87C3F"],
    "--color-on-accent": ["#FFFFFF", "#1B1916"],
  },
});
