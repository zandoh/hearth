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
