import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Go backend during development; in production the binary serves both.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
})
