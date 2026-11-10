import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configMissing = !url || !key

// Only the PUBLISHABLE key belongs here. Never a secret/service-role key.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

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
