# Roshan Rozgar — Architecture

Status: Phase 1 (approved plan, not yet implemented). Design source: Figma `L1t1TDh9SlCttAK12X7hGU`. Decisions: [DECISIONS.md](DECISIONS.md). Data model: [DATABASE.md](DATABASE.md). Endpoints: [API.md](API.md).

## 1. System overview

```
┌──────────────────────────── Browser (mobile-first PWA-ready SPA) ────────────────────────────┐
│ React 19 · TypeScript · Vite 8 · Tailwind 4 (Figma tokens as CSS vars) · React Router 8      │
│ TanStack Query · React Hook Form + Zod · i18next (ur / roman / en) · dir=rtl for ur          │
│                                                                                               │
│  READS ──► supabase-js (publishable key + user JWT) ──► Postgres via PostgREST, RLS enforced │
│  REALTIME ► supabase-js channels (job status, messages) ──► RLS-filtered                      │
│  WRITES / BUSINESS ACTIONS / AI ──► fetch → Express API (Bearer = user access token)          │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                     │ HTTPS, CORS allowlist
┌──────────────────────────── Express 5 API (Node 24, TypeScript) ─────────────────────────────┐
│ helmet · pino-http · request id · rate limits · Zod validation · central error mapper        │
│ auth middleware: verify JWT with jose against Supabase JWKS (ES256) → req.user {id, aal}     │
│ db access: supabase-js client created PER REQUEST with the caller's JWT → RLS + auth.uid()   │
│ modules: me · workers · jobs · quotes · messages · reviews · reports · ai · admin · health   │
│ integrations: stt/ (adapter: provider TBD by bake-off) · llm/ (Anthropic Claude) · storage/  │
│ privileged/: ONLY place that uses the Supabase secret key (admin ops, notifications fan-out) │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                     │
┌──────────────────────────── Supabase ─────────────────────────────────────────────────────────┐
│ Postgres 17: tables + RLS (deny by default) · SECURITY DEFINER transition functions          │
│ partial unique indexes (no double booking) · pg_trgm (area matching) · PostGIS (distance)    │
│ Auth: email OTP (phone OTP later), MFA TOTP for admins · Storage: private buckets            │
│ Realtime: postgres_changes on jobs / job_messages / notifications                            │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Responsibility split (who enforces what)

| Concern | Enforced in | Why |
|---|---|---|
| Who can read a row | **Postgres RLS** | Single boundary for both supabase-js reads and API calls |
| Valid state transitions, double booking, review eligibility | **Postgres functions + constraints** | Atomic, concurrency-safe, cannot be bypassed by a buggy client |
| Input shape, size limits, friendly errors | **Express + shared Zod** | Fast rejection, consistent error codes |
| Rate limits, abuse controls, AI cost caps | **Express** (+ Supabase Auth limits) | Needs request context |
| What the user sees/can tap | **Frontend** | UX only — never a security control |

## 3. Request lifecycle (example: customer accepts a quote)

1. UI (C6 → C6c) — user taps **Yes, confirm booking**. Button disables, shows *Please wait…*.
2. `POST /v1/quotes/{quoteId}/accept` with `Authorization: Bearer <access token>`, `Idempotency-Key: <uuid>`.
3. API verifies JWT (JWKS, issuer, audience, expiry) → Zod validates params → rate limit.
4. API calls `rpc('accept_quote', {p_quote_id, p_expected_version})` using a client bound to the user's JWT.
5. Function: locks job `FOR UPDATE`, checks caller is the job's customer, quote is the current pending one and not expired, worker not suspended; sets quote `accepted`, job `confirmed`, writes `job_status_history`; the partial unique index guarantees the worker has no other active booking.
6. Unique violation → function raises `RR409_WORKER_BUSY` → API maps to `409 {code:"WORKER_BUSY"}` → UI shows E4-style explanation.
7. Success → API enqueues notification for the worker → realtime pushes the job change to both users → TanStack Query invalidates `['job', id]`, `['bookings']`.

## 4. Frontend structure

```
frontend/src/
  app/            router, providers (QueryClient, i18n, auth, theme), error boundary, layouts (CustomerLayout, WorkerLayout, AdminLayout, GuestLayout)
  components/ui/  1:1 with Figma component sets: Button, IconButton, Chip, StatusBadge, TextField, SearchField, LanguageSwitcher,
                  TopAppBar, BottomNav, AvailabilityToggle, ProgressStepper, TimelineStep, VoiceInput, VoiceNote, TradeCard,
                  RatingDisplay, RatingInput, Avatar, WorkerCard, TrustItem, QuoteCard, RequestCard, Alert, Dialog, BottomSheet,
                  EmptyState, Toast, Skeleton, DemoTag
  features/       auth · onboarding (W1–W5, E1/E2) · worker-dashboard (W6–W10) · discovery (C1–C4) · jobs (C5–C10, W7–W9) ·
                  reviews · reports · notifications · admin
  lib/            api client (typed, generated types from packages/shared), supabase client, env validation, i18n, rtl helpers
  locales/        ur.json, roman.json, en.json (no hard-coded UI strings)
  styles/         tokens.css (generated from Figma variables), fonts.css
```

- **Design fidelity:** tokens are exported from the Figma variables (`--rr-color-*`, `--rr-space-*`, `--rr-radius-*`) into `tokens.css` and mapped into Tailwind's `@theme`. Each UI component is built against its Figma component set and its states; screens are compared against frames before a phase is closed.
- **RTL:** `<html lang dir>` switches with language; only logical CSS (`ms-*`, `pe-*`, `start/end`); directional icons mirror via a `dir`-aware `Icon` wrapper.
- **Fonts:** self-hosted via @fontsource (Plus Jakarta Sans variable, Noto Nastaliq Urdu), subset, `font-display: swap`, Urdu font loaded only when `ur` is active.
- **Performance budget:** initial JS ≤ 170 KB gzip; route-level code splitting (admin and onboarding are separate chunks); images none beyond icons (SVG).
- **Mobile viewport behaviour (from Figma fixes):** fixed top bar + fixed footer/bottom nav, scrolling content region; one primary action per screen.

## 5. Backend structure

```
backend/src/
  server.ts            app bootstrap (also exported for Vercel)
  config/env.ts        Zod-validated env; fails fast; never logs values
  middleware/          requestId, logger, helmet, cors, auth (jose JWKS), requireRole, requireAdminMfa, rateLimit, idempotency, errorHandler
  modules/<name>/      router.ts · schemas.ts (from packages/shared) · service.ts · *.test.ts
  integrations/        supabase (user-scoped client factory), privileged (secret-key client, isolated), stt/ (interface + adapters), llm/ (Anthropic), storage/
  openapi/             spec generated from shared Zod schemas (zod-to-openapi) → served at /v1/openapi.json
```

Error format (all endpoints): `{ "error": { "code": "WORKER_BUSY", "message": "…safe text…", "requestId": "…" } }`.

## 6. Dependency baseline (checked against npm on 2026-11-10)

| Package | Version | Note |
|---|---|---|
| Node | 24 LTS | react-router needs ≥ 22.22, vitest ≥ 22.12 |
| typescript | **6.0.x** | TS 7.0 is out, but typescript-eslint 8.72 supports only `<6.1.0` — pin 6.0 until it catches up |
| react / react-dom | 19.3 | |
| vite / @vitejs/plugin-react | 8.3 / 6.3 | |
| tailwindcss / @tailwindcss/vite | 4.3 | CSS-first `@theme` config |
| react-router | 8.5 | library (SPA) mode |
| @tanstack/react-query | 5.107 | |
| react-hook-form / @hookform/resolvers | 7.91 / 7.0 | resolvers support zod 4 |
| zod | 4.6 | shared front/back |
| i18next / react-i18next | 27 / 18 | |
| lucide-react | 1.71 | icons where they match Figma; custom SVGs for trade icons |
| @radix-ui/* (dialog etc.) | 1.x | accessible primitives (focus trap, aria) |
| express / helmet / express-rate-limit / pino / pino-http | 5.3 / 8.3 / 8.7 / 10.4 / 11.0 | |
| jose | 6.2 | JWKS verification |
| @supabase/supabase-js / supabase (CLI) | 2.119 / 3.1 | CLI via npx; local stack needs Docker |
| @anthropic-ai/sdk | 1.7 | structured outputs with Zod |
| @asteasolutions/zod-to-openapi | 9.1 | OpenAPI from shared schemas |
| vitest / @testing-library/react / @playwright/test / @axe-core/playwright / supertest | 5.1 / 16.3 / 1.65 / 4.14 / 7.3 | |
| eslint / typescript-eslint / prettier | 10.14 / 8.72 / 3.9 | |
| @sentry/react, @sentry/node | 11.11 | optional until a DSN exists |

Exact versions are locked in `package-lock.json` in Phase 2; upgrades go through Dependabot PRs.

## 7. Environments

| | Frontend | API | Database |
|---|---|---|---|
| local | `vite` dev server :5173 | `tsx watch` :4000 | `npx supabase start` (Docker), seeded DEMO data |
| staging | Vercel preview/staging | Vercel (separate project) | Supabase staging project |
| production | Vercel production | Vercel production | Supabase production project (no demo data) |

Environment variables: see `.env.example` files (Phase 2). Public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, `VITE_SENTRY_DSN`. Server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `AI_EXTRACTION_MODEL`, `STT_PROVIDER`, `STT_API_KEY`, `ALLOWED_ORIGINS`, `SENTRY_DSN`, optional `UPSTASH_REDIS_REST_URL/TOKEN`.

## 8. Implementation order (Phases 2–13)

1. **Phase 2** workspace, tooling, CI, tokens → `tokens.css`, env validation, CLAUDE.md.
2. **Phase 3** migrations in order: extensions & enums → reference data → identity → worker tables → jobs/quotes/messages/history → reviews/stats → reports/notifications/audit/ai_usage → RLS → functions → seed; pgTAP tests incl. concurrency.
3. **Phase 4** auth screens (email OTP), role choice, guards, admin MFA.
4. **Phase 5** UI components (Storybook-free: a `/dev/components` route in dev only) → screens per Figma, including the gap screens.
5. **Phase 6–7** API modules in the order of the booking lifecycle, then wire screens.
6. **Phase 8** STT adapter + bake-off harness, Claude extraction, consent, fallbacks.
7. **Phase 9** cancellation/dispute/review edge cases, stats triggers, concurrency hardening.
8. **Phase 10–13** quality, staging, readiness, approved production deploy.
