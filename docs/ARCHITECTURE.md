# Roshan Rozgar — Architecture

Status: **Option A (hybrid) approved 2026-11-10** — see [ADR-012](DECISIONS.md#adr-012--hybrid-postgres-functions-for-business-rules-express-only-for-secrets). Design source: Figma `L1t1TDh9SlCttAK12X7hGU`. Audit: [PHASE-0-REAUDIT.md](PHASE-0-REAUDIT.md). Data model: [DATABASE.md](DATABASE.md). Endpoints: [API.md](API.md).

## 1. System overview

```
┌──────────────────────── Browser (React 19 · Vite · Tailwind 4 · TanStack Query) ────────────────────────┐
│ Urdu (RTL) / English (LTR) · bottom tabs on phone/tablet, top nav on desktop (Figma 08 · Responsive)    │
│                                                                                                          │
│  READS + BOOKING ACTIONS ──► supabase-js (publishable key + user JWT) ──► Postgres: RLS + functions      │
│  AI · ADMIN · REPORTS    ──► fetch /api/* (Authorization: Bearer <user JWT>) ──► Express API             │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │ same origin (no CORS needed in production)
┌──────────────────────── Express 5 API on Vercel Functions (frontend/api/index.ts) ───────────────────────┐
│ request id · JSON logs (no secrets, no bodies) · Zod-validated env + input · rate limits · error mapper  │
│ auth: supabase.auth.getClaims(token) → verifies ES256 JWT against the project JWKS (cached)             │
│ db: supabase-js client created PER REQUEST with the caller's JWT → RLS and auth.uid() still apply       │
│ modules: health · me · ai (transcribe, extract-profile, summarise-job) · reports · admin                 │
│ privileged: only admin routes use SUPABASE_SERVICE_ROLE_KEY, and only after the admin check            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                     │                                   │                              │
          Supabase Postgres + Auth            Speech-to-text provider          Claude API (claude-opus-5-5)
          (RLS on every table,                (chosen by bake-off;             structured JSON output,
           SECURITY DEFINER functions)         audio not stored)                validated with Zod
```

## 2. Responsibility split (who enforces what)

| Concern | Enforced in | Why |
|---|---|---|
| Who can read a row | **Postgres RLS** | One boundary for every client, including the API |
| Booking state machine, double booking, review eligibility, address privacy | **Postgres functions + constraints** | Atomic (`FOR UPDATE`), concurrency-safe, already tested; one copy of the rules |
| Calls that need a secret (AI providers, service role) | **Express API** | Secrets never reach the browser |
| Input shape and size for API routes | **Express + Zod** | Early rejection, consistent error codes |
| Rate limits, AI cost caps | **Express** (+ Supabase Auth limits) | Needs request context |
| What the user sees or can tap | **Frontend** | UX only — never a security control |

## 3. Request lifecycles

**Booking action (unchanged, no API hop).** Customer taps *Yes, confirm booking* → `supabase.rpc('respond_quote', {p_quote, p_accept:true})` with the user's JWT → function locks the job row, checks the caller is the customer and the quote is current and unexpired, confirms the job, writes history; the partial unique index `uniq_active_booking_per_worker` rejects a second active booking → `WORKER_BUSY` → UI shows the busy explanation.

**AI-assisted onboarding (Phase 8).** Worker records audio → `POST /api/ai/transcribe` (Bearer JWT, audio ≤ 4 MB) → API verifies JWT, checks rate limit → STT provider → transcript → `POST /api/ai/extract-profile` → Claude returns JSON matching a schema → Zod validates → names mapped to real trade/area IDs → app shows *Confirm what we heard* → worker corrects/confirms → **saving still goes through `complete_onboarding`** in Postgres. Any AI failure returns `AI_UNAVAILABLE` and the app falls back to the tap flow.

## 4. Code layout

```
frontend/
  api/index.ts        Vercel Function entry: `export default app` (one function serves /api/*)
  server/             Express app (not under api/, so Vercel doesn't make one function per file)
    app.ts            createApp(deps) — routes, middleware, error handler
    env.ts            Zod-validated server env; reports which integrations are configured, never values
    auth.ts           requireUser middleware (getClaims → req.user), user-scoped Supabase client
    errors.ts         ApiError + JSON error shape
    log.ts            JSON line logger
    rateLimit.ts      fixed-window limiter (per instance; AI limits move to the DB in Phase 8)
    dev.ts            local server on :3001 (Vite proxies /api)
    *.test.ts         Vitest + supertest
  src/                React app (pages/, components/, lib/ — lib/api.ts is the typed API client)
supabase/
  schema.sql          full schema for a new project
  migrations/         numbered changes for an existing project
docs/                 audit, architecture, decisions, database, API
```

Error format for every API route: `{ "error": { "code": "UNAUTHENTICATED", "message": "…safe text…", "requestId": "…" } }`.

## 5. Environments

| | Frontend | API | Database |
|---|---|---|---|
| local | `npm run dev` (:5173, proxies `/api`) | `npm run api` (:3001, tsx watch) | Supabase project (staging project planned, Phase 2b) |
| preview | Vercel preview per branch | same deployment, `/api/*` | staging project once created (until then: production project — **don't test destructive flows on previews**) |
| production | Vercel production (`main`) | same deployment | Supabase production project |

Variables: see `frontend/.env.example`. Public (`VITE_*`): Supabase URL and publishable key, optional `VITE_API_BASE_URL`. Server-only (no `VITE_` prefix, set in Vercel): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (fall back to the `VITE_` values), `ALLOWED_ORIGINS`, and later `ANTHROPIC_API_KEY`, `AI_EXTRACTION_MODEL`, `STT_PROVIDER`, `STT_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Implementation order (remaining phases)

1. **Phase 2** — API skeleton (health, me, JWT check, errors, logs, rate limit), env validation, local proxy, Vitest. *(this step)*
2. **Phase 2b** — staging Supabase project; apply the counter-offer migration there first.
3. **Phase 8** — voice + AI onboarding (STT bake-off, Claude extraction, W3/W4 screens, fallbacks). Blocked on keys.
4. **Phase 10** — Playwright E2E for both roles, SQL/RLS and concurrency tests, accessibility checks, CI.
5. **Phase 3/6** — reports, notifications, audit log, admin (R6).
6. **Phase 4** — password reset, email confirmation with SMTP, leaked-password check.
7. **Phase 12** — SECURITY / DEPLOYMENT / TESTING / KNOWN_LIMITATIONS docs; README AI disclosure.
