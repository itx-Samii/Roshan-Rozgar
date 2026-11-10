import { z } from 'zod'

/**
 * Server-only configuration. Values are validated once and never logged or returned.
 * SUPABASE_* fall back to the public VITE_* values (they are not secrets) so one set of
 * Vercel variables serves both the site and the API.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
  ALLOWED_ORIGINS: z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  // Later phases — optional until the integration is built
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  STT_API_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
})

export type Env = z.infer<typeof schema>

export function readEnv(source: NodeJS.ProcessEnv = process.env): { ok: true; env: Env } | { ok: false; missing: string[] } {
  const parsed = schema.safeParse({
    ...source,
    SUPABASE_URL: source.SUPABASE_URL ?? source.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY ?? source.VITE_SUPABASE_PUBLISHABLE_KEY,
  })
  if (parsed.success) return { ok: true, env: parsed.data }
  // Only field names leave this function — never values
  return { ok: false, missing: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] }
}

/** Which integrations are configured (booleans only) — safe to show on /api/health. */
export function integrations(env: Env | null) {
  return {
    supabase: !!env,
    ai_llm: !!env?.ANTHROPIC_API_KEY,
    ai_stt: !!env?.STT_API_KEY,
    admin: !!env?.SUPABASE_SERVICE_ROLE_KEY,
  }
}
