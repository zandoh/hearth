// Demo mode: the app on GitHub Pages with the backend running inside the
// browser (see api.ts). Baked at build time via VITE_DEMO=1 so production
// builds carry zero demo code paths at runtime.
export const isDemo = import.meta.env.VITE_DEMO === "1";
