// Local API server. Run with `npm run api`; Vite proxies /api to it (see vite.config.ts).
// Loads public values from .env.local; server-only secrets go in .env.server.local (gitignored).
import { createApp } from './app.js'
import { log } from './log.js'

for (const file of ['.env.local', '.env.server.local']) {
  try { process.loadEnvFile(file) } catch { /* file is optional */ }
}

const port = Number(process.env.API_PORT ?? 3001)
createApp().listen(port, () => log('info', 'api_listening', { port }))
