# Architecture Decision Records

Each record: context → decision → consequences. Status of all: **Accepted (2026-11-10)** unless noted.

## ADR-001 — Business invariants live in Postgres
**Context.** Booking must never double-book a worker, skip states, or allow reviews without a completed job — even under concurrent requests or a buggy client.
**Decision.** All state changes are `SECURITY DEFINER` Postgres functions that check the actor and current state, lock rows (`FOR UPDATE`) and write history in one transaction. Partial unique indexes back the invariants. Clients have no direct `UPDATE` on status columns.
**Consequences.** Invariants hold regardless of caller. Logic is in SQL (tested with pgTAP). Express stays thin for these actions.

## ADR-002 — Reads via supabase-js + RLS; writes via Express
**Context.** The master prompt asks to avoid duplicate APIs.
**Decision.** Plain reads (worker search view, own profile, own jobs, messages) go directly from the browser to Supabase with the user's JWT. Mutations, AI, admin and anything needing rate limits go through Express, which calls the DB functions **as the user** (user-scoped client), not with the secret key.
**Consequences.** ~40% smaller API; RLS is the one read boundary and must be tested exhaustively. Secret key confined to `backend/src/integrations/privileged`.

## ADR-003 — JWT verification with JWKS (asymmetric keys)
**Decision.** Projects use asymmetric (ES256) JWT signing keys. Express verifies tokens locally with `jose` (`createRemoteJWKSet` on `/auth/v1/.well-known/jwks.json`), checking `iss`, `aud=authenticated`, `exp`. JWKS cache ≤ 10 min (Supabase guidance).
**Consequences.** No network round-trip per request; key rotation handled by JWKS. Legacy `anon`/`service_role` keys are not used (deprecated by end of 2026) — new `sb_publishable_`/`sb_secret_` keys only.

## ADR-004 — Email OTP first, phone OTP later (D3)
**Decision.** Supabase Auth email OTP for all roles at launch; MFA TOTP required for admins.
**Consequences.** Workers need an email address (risk for low-literacy users — mitigated by helper-assisted sign-in, planned phone OTP before public launch). "Phone verified" never shown until real phone OTP exists. Production requires custom SMTP.

## ADR-005 — Availability is derived, not stored
**Decision.** Worker stores only a manual `available|offline`. Effective status is computed: `busy` when an active booking exists.
**Consequences.** Availability can't drift from booking state. Discovery queries use a view.

## ADR-006 — Speech-to-text provider chosen by bake-off; Claude for extraction (D4)
**Decision.** STT behind an adapter interface; provider picked after testing ~30 consented recordings. Structured extraction uses Anthropic Claude (`claude-opus-5-5` by default, configurable via `AI_EXTRACTION_MODEL`) with Zod-validated structured output, server-side only.
**Consequences.** Voice onboarding reported **blocked** until an STT key exists; tap fallback always works. AI output never saved without the worker's confirmation.

## ADR-007 — Monorepo with npm workspaces
**Decision.** `frontend/`, `backend/`, `packages/shared/`, `supabase/`, `tests/e2e/`. npm (installed) rather than pnpm (not installed).
**Consequences.** One lockfile; shared Zod schemas guarantee front/back agreement and generate OpenAPI.

## ADR-008 — TypeScript 6.0, not 7.0
**Context.** TypeScript 7.0 is released, but typescript-eslint 8.72 declares `typescript <6.1.0`.
**Decision.** Pin TypeScript `~6.0`. Revisit when typescript-eslint supports 7.
**Consequences.** Slightly slower type-checking than TS 7's native compiler; full lint support.

## ADR-009 — Vercel for frontend and API (D2, default — confirm before Phase 11)
**Decision.** Two Vercel projects (web, api). Express exported as the handler. Rate limiting via Upstash Redis in production (serverless instances don't share memory); in-memory limiter locally.
**Consequences.** One platform, previews per PR. If long-lived connections are ever needed, move API to Render/Railway without code changes beyond the entry file.

## ADR-010 — Distance is to the worker's service area (D5, default — confirm)
**Decision.** Workers declare service areas (seeded centroids). With customer GPS consent we show "≈ X km to <area>"; without it, the area names. No live worker location tracking.
**Consequences.** Honest and privacy-preserving; differs from the Figma copy "1.2 km away" (copy update needed).

## ADR-011 — Seed data is development-only and labelled
**Decision.** `supabase/seed.sql` contains reference data (cities, areas, trades) for every environment and DEMO people only for local/staging; DEMO profiles carry `is_demo = true` and render the Demo tag.
**Consequences.** Production never contains fake workers or reviews.

---

## Updates after the MVP (2026-11-10)

The MVP was built time-boxed and deviated from some records above. Status of earlier records:
- **ADR-002** (writes via Express) — **superseded by ADR-012.** Booking writes call Postgres functions directly.
- **ADR-004** (email OTP) — **not implemented yet.** Email + password is live; OTP/password reset are Phase 4.
- **ADR-007** (npm workspaces monorepo) — **superseded.** Single `frontend/` package containing `src/` (browser) and `server/` + `api/` (API).
- **ADR-008** (TypeScript 6.0) — **deferred.** The MVP uses TypeScript 5.9; no ESLint yet.
- **ADR-009** (two Vercel projects) — **superseded by ADR-014.** One Vercel project serves the site and the API.

## ADR-012 — Hybrid: Postgres functions for business rules, Express only for secrets
**Context.** The brief asks for an Express API for every endpoint. The MVP already enforces every booking rule in `SECURITY DEFINER` Postgres functions behind RLS, and those rules are tested. The hackathon weights reliability over feature count.
**Decision.** Keep reads and booking actions as direct supabase-js calls with the user's JWT. Build a small Express API only for work that needs a secret or a third-party call: AI (speech-to-text, Claude), admin moderation (service role), reports, health. Approved by the project owner (Option A).
**Consequences.** One copy of the booking rules; no extra network hop for bookings. The API never re-implements authorisation that Postgres already does — when it touches user data it uses a client bound to the caller's JWT. The brief's "Express for all endpoints" is intentionally not followed; this record is the justification.

## ADR-013 — JWT verification with supabase-js `getClaims()`
**Context.** The project signs JWTs with ES256 (checked: the JWKS at `/auth/v1/.well-known/jwks.json` lists an EC/ES256 key). ADR-003 planned `jose`.
**Decision.** Use `supabase.auth.getClaims(token)`, which verifies asymmetric JWTs locally against the cached JWKS (issuer, expiry, signature). No extra dependency.
**Consequences.** No Auth server round-trip per request. Role is read from `public.profiles` with the user's own JWT, never from the request body.

## ADR-014 — API in the same Vercel project (`frontend/api/index.ts`)
**Context.** Vercel creates one function per file in `api/`; Express apps can be exported as the default export. Request bodies are limited to 4.5 MB; Hobby functions run up to 300 s.
**Decision.** One function, `api/index.ts`, exports the Express app; app code lives in `server/` so it is not split into many functions. `vercel.json` rewrites `/api/*` to that function and every other path (except `/api/`) to `index.html`. Same origin in production, so no CORS; `ALLOWED_ORIGINS` only for other origins.
**Consequences.** One deploy for site + API. Audio uploads must stay under ~4 MB (≈ 2 min of compressed speech — enough for onboarding answers). In-memory rate limits are per function instance; AI limits move to a database counter in Phase 8.
