import type { ErrorRequestHandler, RequestHandler } from 'express'
import { z } from 'zod'
import { log } from './log.js'

export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED'
  | 'RATE_LIMITED' | 'PAYLOAD_TOO_LARGE' | 'SERVER_MISCONFIGURED' | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400,
  RATE_LIMITED: 429, PAYLOAD_TOO_LARGE: 413, SERVER_MISCONFIGURED: 503, INTERNAL: 500,
}

/** An error whose message is safe to show to the user. */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message); this.code = code; this.details = details
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new ApiError('NOT_FOUND', 'No such API route'))

/** One JSON error shape for every route: { error: { code, message, requestId, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined
  let e: ApiError
  if (err instanceof ApiError) e = err
  else if (err instanceof z.ZodError) e = new ApiError('VALIDATION_FAILED', 'Some fields are missing or not valid', z.flattenError(err).fieldErrors)
  else if ((err as { type?: string })?.type === 'entity.too.large') e = new ApiError('PAYLOAD_TOO_LARGE', 'The upload is too large')
  else if ((err as { type?: string })?.type === 'entity.parse.failed') e = new ApiError('VALIDATION_FAILED', 'The request body is not valid JSON')
  else {
    // Unknown errors: log the detail server-side, send a generic message
    log('error', 'unhandled_error', { requestId, path: req.path, name: (err as Error)?.name, message: (err as Error)?.message })
    e = new ApiError('INTERNAL', 'Something went wrong. Please try again.')
  }
  res.status(STATUS[e.code]).json({ error: { code: e.code, message: e.message, requestId, ...(e.details ? { details: e.details } : {}) } })
}
