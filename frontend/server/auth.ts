import type { RequestHandler } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from './errors.js'
import type { Env } from './env.js'

export type AuthUser = { id: string; email?: string }

/** Verifies a Supabase access token and returns the user, or null if it is not valid. */
export type TokenVerifier = (token: string) => Promise<AuthUser | null>

/**
 * Default verifier: supabase-js getClaims() checks the ES256 signature against the project's
 * JWKS (cached), plus issuer and expiry — no Auth server round-trip per request (ADR-013).
 */
export function supabaseVerifier(env: Env): TokenVerifier {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return async (token) => {
    const { data, error } = await client.auth.getClaims(token)
    if (error || !data?.claims?.sub) return null
    if (data.claims.role !== 'authenticated') return null
    return { id: data.claims.sub, email: typeof data.claims.email === 'string' ? data.claims.email : undefined }
  }
}

/** A Supabase client that acts AS the caller, so RLS and auth.uid() apply to everything it does. */
export function userClient(env: Env, token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export function bearer(header: string | undefined): string | null {
  const m = header?.match(/^Bearer\s+([A-Za-z0-9\-_.]+)$/i) // scheme is case-insensitive (RFC 9110)
  return m ? m[1] : null
}

/** Rejects the request unless it carries a valid Supabase access token. Sets res.locals.user and res.locals.token. */
export function requireUser(verify: TokenVerifier): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = bearer(req.header('authorization'))
      if (!token) throw new ApiError('UNAUTHENTICATED', 'Please sign in again')
      const user = await verify(token)
      if (!user) throw new ApiError('UNAUTHENTICATED', 'Your session has expired. Please sign in again')
      res.locals.user = user
      res.locals.token = token
      next()
    } catch (e) { next(e) }
  }
}
