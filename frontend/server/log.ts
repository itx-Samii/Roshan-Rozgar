import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

type Level = 'info' | 'warn' | 'error'

/** One JSON line per event. Callers must not pass secrets, tokens, request bodies or personal data. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'test') return
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(line); else console.log(line)
}

/** Adds a request id (echoed as X-Request-Id) and logs method, path, status and duration. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id')
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  res.locals.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  const start = performance.now()
  res.on('finish', () => {
    log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
      requestId, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(performance.now() - start),
      user: (res.locals.user as { id?: string } | undefined)?.id,
    })
  })
  next()
}
