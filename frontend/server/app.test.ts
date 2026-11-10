import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'
import { readEnv, type Env } from './env.js'
import { bearer } from './auth.js'

const env: Env = {
  NODE_ENV: 'test', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  ALLOWED_ORIGINS: ['https://allowed.example'], ANTHROPIC_API_KEY: 'sk-test-should-never-leak',
}
const verifyToken = async (token: string) => (token === 'good.token.sig' ? { id: 'user-1', email: 'w@example.com' } : null)
const loadProfile = async (_t: string, id: string) => (id === 'user-1' ? { role: 'worker', display_name: 'Ahmed' } : null)
const app = () => createApp({ env, verifyToken, loadProfile })

describe('GET /api/health', () => {
  it('reports integrations as booleans and never leaks values', async () => {
    const res = await request(app()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.integrations).toEqual({ supabase: true, ai_llm: true, ai_stt: false, admin: false })
    expect(JSON.stringify(res.body)).not.toContain('sk-test')
    expect(res.headers['x-request-id']).toMatch(/[\w-]{8,}/)
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
  it('is degraded, not crashed, when configuration is missing', async () => {
    const res = await request(createApp({ env: null })).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('degraded')
    expect(res.body.missingConfig).toContain('SUPABASE_URL')
  })
})

describe('GET /api/me', () => {
  it('rejects a missing token with the JSON error shape', async () => {
    const res = await request(app()).get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(res.body.error.requestId).toBeTruthy()
  })
  it('rejects an invalid or malformed token', async () => {
    expect((await request(app()).get('/api/me').set('Authorization', 'Bearer bad.token.sig')).status).toBe(401)
    expect((await request(app()).get('/api/me').set('Authorization', 'Basic abc')).status).toBe(401)
  })
  it('returns identity from the token and role from the database', async () => {
    const res = await request(app()).get('/api/me').set('Authorization', 'Bearer good.token.sig')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'user-1', email: 'w@example.com', role: 'worker', displayName: 'Ahmed' })
  })
  it('returns 503 when the server is not configured', async () => {
    const res = await request(createApp({ env: null })).get('/api/me').set('Authorization', 'Bearer good.token.sig')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('SERVER_MISCONFIGURED')
  })
  it('rate limits per user', async () => {
    const a = app()
    let last = 0
    for (let i = 0; i < 61; i++) last = (await request(a).get('/api/me').set('Authorization', 'Bearer good.token.sig')).status
    expect(last).toBe(429)
  })
})

describe('errors and CORS', () => {
  it('unknown routes return JSON 404', async () => {
    const res = await request(app()).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
  it('bad JSON returns a 400 validation error', async () => {
    const res = await request(app()).post('/api/me').set('Content-Type', 'application/json').send('{"broken"')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })
  it('only allow-listed origins get CORS headers', async () => {
    const ok = await request(app()).options('/api/me').set('Origin', 'https://allowed.example')
    expect(ok.status).toBe(204)
    expect(ok.headers['access-control-allow-origin']).toBe('https://allowed.example')
    const no = await request(app()).get('/api/health').set('Origin', 'https://evil.example')
    expect(no.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('helpers', () => {
  it('parses only well-formed bearer tokens', () => {
    expect(bearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearer('bearer abc')).toBe('abc')
    expect(bearer('Bearer abc def')).toBeNull()
    expect(bearer(undefined)).toBeNull()
  })
  it('env falls back to the public VITE_ values and reports missing names only', () => {
    const r = readEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' } as NodeJS.ProcessEnv)
    expect(r.ok).toBe(true)
    const bad = readEnv({ SUPABASE_PUBLISHABLE_KEY: 'secret-looking-value' } as NodeJS.ProcessEnv)
    expect(bad.ok).toBe(false)
    if (!bad.ok) { expect(bad.missing).toContain('SUPABASE_URL'); expect(JSON.stringify(bad)).not.toContain('secret-looking-value') }
  })
})
