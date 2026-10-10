import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves the demo under /hearth/. The default stays root.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // react-draggable (in react-grid-layout) reads process.env at runtime. Production
  // builds strip it, but the dev server doesn't shim `process`, so without this every
  // drag throws "process is not defined" on :5173 only.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  build: {
    rolldownOptions: {
      output: {
        // Dependencies change less often than app code. A separate vendor chunk means a
        // hearth update re-downloads only the small app chunk on the kiosk, not react-dom and
        // Astryx.
        codeSplitting: {
          // react-simple-keyboard is excluded: only the lazy OskDock import reaches it, and it
          // would otherwise land in the eager vendor chunk.
          groups: [{ name: 'vendor', test: /node_modules(?![\\/]react-simple-keyboard)/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      // The Go backend during development. In production the binary serves both.
      '/api': {
        target: process.env.HEARTH_API ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
})
