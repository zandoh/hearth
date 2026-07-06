import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves the demo under /hearth/; default stays root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // react-draggable (used by react-grid-layout) reads process.env at runtime;
  // production builds strip it but the dev server doesn't shim `process`, so
  // without this every drag throws "process is not defined" on :5173 only.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  build: {
    rolldownOptions: {
      output: {
        // Dependencies change far less often than app code; a separate
        // vendor chunk means a hearth update only re-downloads the small
        // app chunk on the kiosk instead of react-dom + Astryx every time.
        codeSplitting: {
          // react-simple-keyboard is excluded: it's only reachable through
          // the lazy OskDock import and would otherwise be pulled into the
          // eagerly-loaded vendor chunk.
          groups: [{ name: 'vendor', test: /node_modules(?![\\/]react-simple-keyboard)/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      // Go backend during development; in production the binary serves both.
      '/api': {
        target: process.env.HEARTH_API ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
})
