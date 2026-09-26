import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // In `npm run dev`, forward /api to the Go server, as nginx does in Docker.
  // API_PROXY=http://localhost:3000 uses the docker-compose stack instead.
  server: {
    proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8080' },
  },
})
