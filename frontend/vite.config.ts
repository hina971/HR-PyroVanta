import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Local dev convenience: if a FastAPI backend runs on :8000, /api
      // requests are proxied to it. VITE_API_URL (see .env.example) takes
      // precedence when set; the proxy only applies to relative /api calls.
      '/api': 'http://localhost:8000',
    },
  },
})
