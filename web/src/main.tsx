import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "react-grid-layout/css/styles.css";
import "./index.css"; // Astryx + Tailwind layers live here
import App from "./App";
import { hearthTheme } from "./theme";
import { useThemeMode } from "./themeMode";

function Root() {
  const mode = useThemeMode();
  return (
    <Theme theme={hearthTheme} mode={mode}>
      <App />
    </Theme>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
