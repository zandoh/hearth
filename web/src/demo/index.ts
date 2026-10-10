// Demo mode: the app on GitHub Pages with the backend running in the browser (api.ts).
// Set at build time by VITE_DEMO=1, so production builds have no demo code paths.
export const isDemo = import.meta.env.VITE_DEMO === "1";
