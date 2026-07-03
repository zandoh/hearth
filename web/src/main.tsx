import { StrictMode, useEffect } from "react";
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
import { hearthTheme } from "./hearth";
import { applyFavicon, useThemeMode } from "./themeMode";

function Root() {
  const mode = useThemeMode();
  // Favicon follows the active theme, tracking OS flips while in system mode.
  useEffect(() => {
    applyFavicon(mode);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyFavicon(mode);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
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
