import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "react-grid-layout/css/styles.css";
import "./index.css"; // Astryx + Tailwind layers live here
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
