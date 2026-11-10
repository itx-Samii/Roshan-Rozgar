/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Local API (`npm run api`) — in production /api is served by the same Vercel deployment
  server: { proxy: { '/api': 'http://localhost:3001' } },
  test: { include: ['server/**/*.test.ts', 'src/**/*.test.ts?(x)'], environment: 'node' },
})
