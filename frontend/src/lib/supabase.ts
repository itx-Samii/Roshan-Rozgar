import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configMissing = !url || !key

// Only the PUBLISHABLE key belongs here. Never a secret/service-role key.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * Password reset via the email LINK signs the user in with event PASSWORD_RECOVERY.
 * The listener is registered right after the client is created (before it finishes reading the
 * link), so the event is never missed; the app then shows "Set a new password" before anything else.
 * The in-app CODE flow sets the password itself, so it suppresses this screen with `inline()`.
 */
const RECOVERY_KEY = 'rr-recovery'
let recoveryPending = (() => { try { return sessionStorage.getItem(RECOVERY_KEY) === '1' } catch { return false } })()
let recoveryInline = false
const recoveryListeners = new Set<() => void>()
const setRecovery = (v: boolean) => {
  recoveryPending = v
  try { if (v) sessionStorage.setItem(RECOVERY_KEY, '1'); else sessionStorage.removeItem(RECOVERY_KEY) } catch { /* storage unavailable */ }
  recoveryListeners.forEach((f) => f())
}
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' && !recoveryInline) setRecovery(true)
  if (event === 'SIGNED_OUT' && recoveryPending) setRecovery(false)
})
export const recovery = {
  get pending() { return recoveryPending },
  subscribe(f: () => void) { recoveryListeners.add(f); return () => { recoveryListeners.delete(f) } },
  clear() { setRecovery(false) },
  /** Run the code-based reset without showing the link-based "set a new password" screen. */
  async inline<T>(fn: () => Promise<T>): Promise<T> { recoveryInline = true; try { return await fn() } finally { recoveryInline = false } },
}

export type JobStatus =
  | 'requested' | 'quoted' | 'confirmed' | 'in_progress' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'disputed'

/** Turns database error codes raised by our SQL functions into stable codes for the UI. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? ''
  const pgCode = (e as { code?: string })?.code
  if (pgCode === 'PGRST116') return 'NOT_FOUND' // ".single()" found no row the caller may see
  if (msg.includes('Invalid login credentials')) return 'BAD_LOGIN'
  if (msg.includes('already registered')) return 'EMAIL_TAKEN'
  if (/email not confirmed/i.test(msg)) return 'EMAIL_NOT_CONFIRMED'
  if (/token has expired or is invalid|otp.*(expired|invalid)/i.test(msg)) return 'OTP_INVALID'
  if (/not authorized/i.test(msg) && /email/i.test(msg)) return 'EMAIL_NOT_AUTHORIZED'
  if (/should be different from the old password|same_password/i.test(msg)) return 'SAME_PASSWORD'
  if (/rate limit|too many/i.test(msg)) return 'RATE_LIMITED'
  if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return 'WEAK_PASSWORD'
  const known = ['WORKER_OFFLINE','WORKER_BUSY','QUOTE_EXPIRED','QUOTE_NOT_CURRENT','INVALID_TRANSITION','ALREADY_REVIEWED','OPEN_REQUEST_EXISTS','ROLE_ALREADY_SET','FORBIDDEN','NOT_FOUND','VALIDATION_FAILED']
  return known.find((k) => msg.includes(k)) ?? (msg.includes('Failed to fetch') ? 'NETWORK' : 'UNKNOWN')
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
