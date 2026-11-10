import { supabase } from './supabase'

/** Error returned by the Express API: { error: { code, message, requestId } }. */
export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId?: string
  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message); this.code = code; this.status = status; this.requestId = requestId
  }
}

const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/**
 * Typed call to our API. Sends the current Supabase access token; the server verifies it.
 * Network failures become code NETWORK so the UI can show the usual retry message.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof Blob)) headers.set('Content-Type', 'application/json')
  let res: Response
  try { res = await fetch(`${base}/api${path}`, { ...init, headers }) }
  catch { throw new ApiRequestError('NETWORK', 'Network error', 0) }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiRequestError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText, res.status, body?.error?.requestId)
  return body as T
}

export type Me = { id: string; email: string | null; role: 'worker' | 'customer' | null; displayName: string }
export type Health = { status: 'ok' | 'degraded'; integrations: { supabase: boolean; ai_llm: boolean; ai_stt: boolean; admin: boolean } }
