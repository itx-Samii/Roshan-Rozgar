import type { RequestHandler } from 'express'
import { ApiError } from './errors.js'

/**
 * Fixed-window limiter keyed by user (or IP when signed out).
 * Memory is per function instance on Vercel, so this is a first line of defence only;
 * AI cost limits are enforced with a database counter in Phase 8 (ADR-014).
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req, res, next) => {
    const now = Date.now()
    const who = (res.locals.user as { id?: string } | undefined)?.id ?? req.ip ?? 'unknown'
    const key = `${name}:${who}`
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs })
    else entry.count += 1
    const current = hits.get(key)!
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - current.count)))
    if (current.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)))
      return next(new ApiError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'))
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
    next()
  }
}
