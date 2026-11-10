import express, { type RequestHandler } from 'express'
import { ApiError, errorHandler, notFound } from './errors.js'
import { requestLogger } from './log.js'
import { readEnv, integrations, type Env } from './env.js'
import { requireUser, supabaseVerifier, userClient, type TokenVerifier } from './auth.js'
import { rateLimit } from './rateLimit.js'

export type AppDeps = {
  env?: Env | null
  verifyToken?: TokenVerifier
  /** Loads the caller's profile row with their own JWT (RLS applies). Injected in tests. */
  loadProfile?: (token: string, userId: string) => Promise<{ role: string | null; display_name: string } | null>
}

/** Builds the API. Dependencies are injectable so tests don't need network access. */
export function createApp(deps: AppDeps = {}) {
  const envResult = deps.env !== undefined ? (deps.env ? { ok: true as const, env: deps.env } : { ok: false as const, missing: ['SUPABASE_URL'] }) : readEnv()
  const env = envResult.ok ? envResult.env : null

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true) // Vercel sets X-Forwarded-For
  app.use(requestLogger)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  // CORS only for explicitly allowed other origins; production is same-origin
  app.use((req, res, next) => {
    const origin = req.header('origin')
    if (origin && env?.ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      if (req.method === 'OPTIONS') return res.status(204).end()
    }
    next()
  })
  app.use(express.json({ limit: '100kb' }))

  const api = express.Router()

  /** Liveness + which integrations are configured. Never returns values. */
  api.get('/health', (_req, res) => {
    res.json({ status: envResult.ok ? 'ok' : 'degraded', time: new Date().toISOString(), integrations: integrations(env),
      ...(envResult.ok ? {} : { missingConfig: envResult.missing }) })
  })

  const needEnv: RequestHandler = (_req, _res, next) =>
    next(env ? undefined : new ApiError('SERVER_MISCONFIGURED', 'The service is not configured yet'))
  const verify = deps.verifyToken ?? (env ? supabaseVerifier(env) : async () => null)
  const loadProfile = deps.loadProfile ?? (async (token: string, userId: string) => {
    const { data, error } = await userClient(env!, token).from('profiles').select('role, display_name').eq('id', userId).maybeSingle()
    if (error) throw error
    return data
  })

  /** Who am I — identity from the verified token, role from the database (never from the client). */
  api.get('/me', needEnv, requireUser(verify), rateLimit({ name: 'me', windowMs: 60_000, max: 60 }), async (_req, res, next) => {
    try {
      const user = res.locals.user as { id: string; email?: string }
      const profile = await loadProfile(res.locals.token as string, user.id)
      if (!profile) throw new ApiError('NOT_FOUND', 'Profile not found')
      res.json({ id: user.id, email: user.email ?? null, role: profile.role, displayName: profile.display_name })
    } catch (e) { next(e) }
  })

  app.use('/api', api)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
