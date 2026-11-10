# Roshan Rozgar — Phase 0: Repository & Figma Audit, Architecture Plan

Status: **for approval — no application code written yet.**
Date: 2026-11-10 · Design source: [Figma file](https://www.figma.com/design/L1t1TDh9SlCttAK12X7hGU) (inspected via Figma MCP in this session)

---

## 1. Existing codebase audit

| Item | Finding |
|---|---|
| Repository | `D:\web`, git initialised, branch `main`, **no commits**. Remote `origin` = `https://github.com/itx-Samii/Roshan-Rozgar.git`, reachable, **empty** (no branches). |
| Source code | None. Only an empty `.claude/skills/` folder. Nothing to migrate or preserve. |
| Node / npm | Node **24.21.0** (current LTS line), npm 11.19 — suitable. |
| Not installed | `gh` (GitHub CLI), Supabase CLI, Vercel CLI, **Docker**, `psql`, `pnpm`. |
| Consequence | Supabase CLI can run through `npx supabase`, but **the local Supabase stack (`supabase start`) and `supabase test db` need Docker**. Without Docker we must develop and test migrations against a hosted Supabase *dev* project (decision D1). |
| Existing docs / instructions | None besides the Figma "Dev Handoff" page. |

## 2. Figma inventory (actual frames, read from the file)

**Pages:** 00 Cover · 01 Foundations · 02 Components · 03 IA & Journeys · 04 Wireframes · 05 Worker Flow · 06 Customer Flow · 07 Edge Cases · 08 Responsive · 09 Dev Handoff.

**Tokens:** 32 primitive colours, 41 semantic colours (mode "Light"), 20 spacing/radius/size values, 23 text styles (EN: Plus Jakarta Sans · UR: Noto Nastaliq Urdu), 4 effect styles (3 elevations + focus ring). Every variable has a `var(--rr-…)` code-syntax name → maps 1:1 to CSS custom properties / Tailwind theme.

**Component sets (31):** Button (4 hierarchies × 6 states), Icon Button, Chip, Status Badge (9 statuses × EN/UR), Demo Tag, Listen Button, Text Field (5 states), Search Field, Language Switcher, Top App Bar, Bottom Nav (worker/customer), Availability Toggle, Progress Stepper, Timeline Step, Voice Input (7 states), Voice Note, Trade Card, Rating Display, Rating Input (0–5), Avatar, Worker Card, Trust Item, Quote Card (4 states), Request Card, Alert (4 types), Dialog, Bottom Sheet, Empty State, Toast, Demo Control (prototype-only). Plus 63 icons, logo mark/app icon/lockup, skeleton, status bar.

**Screens (mobile 390×844 unless noted):**

| Area | Frames |
|---|---|
| Guest | G1 landing + role + language |
| Worker (Urdu RTL) | W1 welcome · W2 trade · W3 voice capture · W4 confirm AI fields (+W4a/b/c correction sheets) · W5 profile completion · W6 availability dashboard · W7 requests · W8 send quote · W8b quote sent · W8c booking confirmed · W9 active job · W9b confirm completion · W9c waiting for customer · W10 reviews · E1 mic denied · E2 tap fallback |
| Customer (EN LTR) | C1 home · C2 location · C3 worker list · C4 worker profile · C5 job request · C6 negotiation · C6c confirm price · C6d declined · C6e counter sent · E6 counter-offer sheet · C7 booking confirmed · C8 progress · C9/C9b/C9c completion + rating · C9p problem · C10 review posted · C10b completed without review |
| Edge cases | E3 none nearby · E4 worker busy · E5 counter-offer (worker) · E7 network failure · E8 empty reviews · E9 loading |
| Responsive | R1 desktop home · R2 tablet list · R3 desktop master–detail · R4 desktop negotiation · R5 tablet worker (RTL) · R6 admin moderation |
| Specs | Sitemap, permissions matrix, booking state machine, 2 journey maps, 8 lo-fi wireframes, dev handoff |

## 3. Gap analysis

### 3a. Against the five mandatory outcomes

| Outcome | Design coverage | Gaps to close in build |
|---|---|---|
| 1 Worker onboarding without typing | Strong (W1–W5, E1/E2, W4 corrections) | **Sign-up / OTP screens not designed**; microphone + audio-processing **consent screen** missing; W4 corrections are static in the prototype (must be real edits). |
| 2 Discover nearby available workers | Strong (C1–C4, E3/E4/E9, R2/R3) | **City picker** missing (design assumes Lahore); sort/filter sheet only partly designed; distance semantics need a decision (see §5, D5). |
| 3 Communicate + agree price without typing | Good (C5, C6/C6c–e, E5/E6, W7/W8) | Full message thread UI (beyond quick replies + one composer) not designed; worker "Decline request" has no confirmation screen; voice-message recording UI inside the thread not designed. |
| 4 Booking updates availability consistently | Good on screen (W8b/W8c/W9c, C8) | Needs DB-level enforcement (one active booking per worker) — design can't show this; **"awaiting customer confirmation" and "disputed" statuses have no badge variants yet.** |
| 5 Trustworthy reviews from completed jobs | Good (C9–C10b, W10, E8, Trust Item) | Review edit (24 h) screen and "report review" flow not designed. |

### 3b. Screens required by the master prompt but absent from Figma
Sign-in / registration / OTP / account recovery · customer profile & settings · worker profile edit & settings · worker "My jobs" list (accepted bookings) · customer "Bookings" list · notifications list · admin login (+MFA), overview, users, audit history (only R6 reports queue exists) · 404 / error boundary / session-expired / account-suspended states · microphone & location consent explainers.

**Proposal:** build these from existing components and tokens (no new visual language), and add the frames to Figma as we implement them so the design file stays the source of truth. I will flag each one rather than invent silently.

### 3c. Prototype shortcuts that must become real logic
Demo Controls (customer accepts, worker finishes) become real cross-user events · C8 → C9 progression becomes a realtime status change · seeded workers become real accounts (seed data stays labelled DEMO in non-production only) · "Phone verified" only when Supabase Auth has actually confirmed the phone.

## 4. Proposed final architecture

```
Browser (React 19 + TS + Vite, Tailwind with Figma tokens, React Router, TanStack Query, RHF + Zod, i18n ur/roman/en, RTL)
   │  reads: supabase-js with the user's JWT (RLS-protected) — public worker search, own profile, own jobs, realtime messages/status
   │  writes & business actions: HTTPS → Express API
   ▼
Express API (Node 24, TS, Zod, pino logs, central errors, rate limits)
   │  verifies Supabase JWT (JWKS) → calls Postgres functions *as the user* (RLS + auth.uid() still apply)
   │  AI: speech-to-text provider + Claude (structured extraction) — keys server-only
   │  secret/service key used ONLY in an isolated admin/notifications module
   ▼
Supabase: Postgres (RLS, constraints, SECURITY DEFINER state-transition functions, pg_trgm, PostGIS), Auth (phone/email OTP, MFA for admins), Storage (private buckets, signed URLs), Realtime
```

**Key decision — where business rules live:** every state change (send quote, accept quote, start, finish, confirm, cancel, review) is a **Postgres function** that validates the transition, locks rows and writes history in one transaction. Express is the only public caller of those functions and adds Zod validation, rate limiting, notifications, logging and AI. Rationale: invariants are enforced by the database, so a bug in the API or a direct supabase-js call cannot double-book or skip states; and we avoid duplicating logic in two places.

**Simplification vs. your draft (principle 17):** no separate REST endpoints for plain reads that RLS already protects (worker search, own profile, message history) — the frontend reads those directly through supabase-js. Express owns mutations, AI and admin. This removes ~40% of the API surface without weakening security, because RLS is the security boundary either way.

**Repo layout (npm workspaces):**
```
frontend/   React app (src/app, components/ui, features/{auth,customers,workers,bookings,reviews,ai-onboarding,admin}, lib, locales/{ur,roman,en}, styles/tokens.css)
backend/    Express API (src/config, middleware, modules, integrations/{stt,llm,supabase}, server.ts) + OpenAPI
packages/shared/  Zod schemas, enums (statuses, trades), API types shared by both
supabase/   migrations/, seed.sql (reference data + DEMO accounts for dev only), tests/ (pgTAP/RLS)
tests/e2e/  Playwright (mobile + desktop, ur + en)
docs/       ARCHITECTURE, API, DATABASE, SECURITY, DEPLOYMENT, TESTING, KNOWN_LIMITATIONS
.github/workflows/  CI
```

## 5. Database plan (entities, invariants, concurrency)

**Reference data:** `cities`, `service_areas` (city, names ur/roman/en, centroid `geography(Point)`), `service_categories` (slug, names, icon).

**Identity:** `profiles` (id = auth user id, role `customer|worker`, preferred_lang `ur|roman|en`, city, status `active|suspended`) · `admin_users` (separate table; no client write path) · `customer_profiles` (default area) · `worker_profiles` (years_experience 0–60, visit_fee_from, working_hours, manual availability `available|offline`, onboarding_completed_at, photo path).
**Worker links:** `worker_services` (worker, category) · `worker_service_areas` (worker, area).
**Jobs:** `jobs` (customer, worker, category, area, status, problem tags/summary, time window, timestamps per state, `version`) · `job_private_details` (address, landmark — separate table so RLS can hide it) · `job_quotes` (amount PKR, includes, arrival window, proposed_by `worker|customer`, status `pending|accepted|declined|countered|expired|withdrawn`, expires_at) · `job_messages` (text / quick_reply / voice / system, transcript, storage path) · `job_status_history` (append-only).
**Trust:** `reviews` (job unique, rating 1–5, tags, comment, status) · `worker_stats` (review_count, avg_rating, completed_jobs — maintained by trigger) · `user_reports` · `notifications` · `audit_logs` (append-only) · `ai_usage` (provider, model, tokens/audio seconds, latency, status — cost tracking).

**Adjustments to your table list (justified):** `worker_availability` becomes a column + computed view, because "Busy" must be *derived* from active bookings, never stored separately where it can drift. Added `job_private_details`, `cities/service_areas`, `worker_stats`, `ai_usage`, `admin_users`.

**Job state machine:** `requested → quoted ⇄ (counter) → confirmed → in_progress → awaiting_confirmation → completed`; `cancelled` from requested/quoted/confirmed; `disputed` from awaiting_confirmation ("There's a problem"); quotes expire after 30 min.

**Invariants enforced in the database:**
1. **No double booking:** partial unique index `jobs(worker_id) WHERE status IN ('confirmed','in_progress','awaiting_confirmation')` → a second concurrent confirmation for the same worker fails with a unique violation → API returns `409 WORKER_BUSY`.
2. One accepted quote per job; one pending quote per job (partial unique indexes).
3. Clients cannot `UPDATE jobs.status` (privilege revoked); transitions only through functions that check actor + current state (`SELECT … FOR UPDATE`, compare `version`).
4. Review insert only when job is `completed`, reviewer is that job's customer, once per job (`UNIQUE(job_id)`).
5. Worker sees `job_private_details` only from `confirmed` onward.
6. Users cannot change their own `role` or `status`; admin rights only via `admin_users` + MFA (AAL2).
7. Effective availability = `busy` if an active booking exists, else the worker's manual status.

**Concurrency test (required):** two customers holding pending quotes from the same worker call `accept_quote` simultaneously → exactly one succeeds, the other gets `WORKER_BUSY`, the losing quote is marked expired, and history is consistent.

**Backups:** Supabase daily backups (Pro plan); point-in-time recovery is a paid add-on — decide before launch. Migrations are forward-only, reviewed, with a written rollback note each.

## 6. Authentication & role-based access

- **Supabase Auth, email OTP first (D3).** One-time code sent by email; no passwords to remember. Local development uses the Supabase local mail catcher (Inbucket/Mailpit), so no real email is sent. Production needs a custom SMTP sender. **Phone OTP is a planned follow-up** (it fits low-literacy workers best) and needs an SMS provider configured inside Supabase (Twilio / Vonage / MessageBird, or a Send-SMS hook to a Pakistani gateway); the auth layer is built so adding it is a configuration + UI change, not a rewrite.
- Role chosen once after first sign-in through an API call; the server writes it; `admin` is never selectable.
- Express verifies the access token against Supabase's JWKS (asymmetric signing keys) and forwards it to Postgres so RLS uses the real `auth.uid()`.
- Admin area: separate route, `admin_users` membership **and** TOTP MFA (AAL2) checked in API middleware *and* RLS; every admin action writes `audit_logs`.
- "Phone verified" badge = `auth.users.phone_confirmed_at` is set (exposed via a security-definer view). No ID/CNIC claim anywhere.

## 7. AI integration plan

| Step | Provider | Notes |
|---|---|---|
| Speech-to-text (Urdu, Roman Urdu, Punjabi-accented) | **Separate STT provider needed** — Claude does not transcribe audio. Candidates: OpenAI transcription, Google Cloud Speech-to-Text (ur-PK), Azure AI Speech (ur-PK), ElevenLabs Scribe. | Run a **bake-off on ~30 real recordings** (street noise, names, area names, numbers) before choosing (D4). Adapter interface so the provider is swappable. |
| Structured extraction (name, years, trades, areas) | **Anthropic Claude** via `@anthropic-ai/sdk`, structured outputs validated with Zod. Default model `claude-opus-5-5` (configurable via env; a cheaper model such as Haiku is your call after measuring quality). Server-side refusal fallback enabled. | Transcript is passed as data, no tools, no side effects. Area names are matched server-side against `service_areas` (pg_trgm), never created from AI text. Output is shown on W4 and **saved only after the worker confirms**. |
| Also | Roman Urdu job-description normalisation + category suggestion (C5); short job summaries for workers (W7) | Same validation + confirmation rules. |
| "سنیں" audio help | Pre-recorded Urdu clips (static files) | Needs a native speaker to record ~20 clips; no TTS vendor. |

Reliability & privacy: explicit consent screen before first recording; onboarding audio is processed in memory and **not stored**; job voice notes go to a private bucket and are deleted 30 days after the job closes; max 60 s / 2 MB per clip; per-user daily limits; timeouts with the tap fallback (E2) always available; every call logged to `ai_usage` for cost tracking. AI output is never used for identity, trust, booking or payment decisions.

## 8. External services & credentials

| Service | Why | Credentials | Public or secret | Where it goes |
|---|---|---|---|---|
| Supabase (dev, staging, prod projects) | DB, Auth, Storage, Realtime | Project URL, publishable key | Public | `frontend/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) |
| Supabase | Admin tasks, notifications | Secret (service-role) key | **Secret** | backend env / host secret manager only |
| Supabase CLI | Apply migrations from CI | Access token + DB password | **Secret** | GitHub Actions secrets |
| SMS provider (via Supabase Auth) | Phone OTP | Provider SID/token | **Secret** | Entered in Supabase dashboard — never in our code |
| Anthropic | Profile extraction, normalisation | API key | **Secret** | backend env |
| Speech-to-text provider | Urdu transcription | API key / service account | **Secret** | backend env |
| Vercel | Hosting | GitHub integration (no key in repo) | — | Vercel dashboard |
| GitHub | Code + CI | Push access for this machine | — | Git credential manager |
| Sentry (recommended) | Error monitoring | DSN (frontend, low-sensitivity), auth token for source maps | DSN public / token secret | env + CI secret |
| Upstash Redis (optional) | Rate limiting across serverless instances | REST URL + token | **Secret** | backend env |

`.env.example` files will list names only. I will never ask for secret values in chat — you place them in local `.env` files or host secret managers, and I verify integrations with health checks that don't print values.

## 9. Security risks (top) and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | RLS misconfiguration exposes other users' jobs/addresses | Deny-by-default policies; pgTAP + API tests for cross-account access on every table; address in separate table |
| 2 | Secret key leaks to the browser | Only `VITE_` publishable values in frontend; CI check that build output contains no secret patterns; gitleaks in CI |
| 3 | Role escalation (user sets own role/admin) | Column privileges revoked; role set by server function once; admin via separate table + MFA |
| 4 | Double booking / invalid transitions under concurrency | DB functions + partial unique indexes + concurrency test |
| 5 | SMS OTP abuse (toll fraud, brute force) | Supabase rate limits, CAPTCHA on OTP send, per-IP limits |
| 6 | Prompt injection / bad AI output | No tools, schema-validated output, human confirmation, area matching against reference data |
| 7 | Audio/PII retention | No storage of onboarding audio; voice-note retention policy; PII-free logs |
| 8 | Contact-info leakage / off-platform scams before booking | Phone/address hidden until confirmed; flag phone numbers in pre-booking messages for moderation |
| 9 | Fake reviews | Only completed bookings, one per job, reporting + moderation, audit log |
| 10 | XSS via messages/reviews | React escaping, no `dangerouslySetInnerHTML`, CSP headers |
| 11 | CORS / CSRF | Bearer tokens (not cookies), strict `ALLOWED_ORIGINS` |
| 12 | Vulnerable dependencies | `npm audit` + Dependabot in CI, minimal dependency list |

## 10. Phase-by-phase checklist

| Phase | Deliverable | Gate |
|---|---|---|
| 0 Audit | This document | **Your approval + decisions D1–D5** |
| 1 Plan | ARCHITECTURE.md, DATABASE.md, API.md skeleton (OpenAPI), ADRs for decisions | Approval |
| 2 Dev environment | npm workspaces, TS strict, ESLint/Prettier, Vitest, Playwright, Tailwind with Figma tokens, `.env.example` + runtime env validation, CI (lint/typecheck/test/build), CLAUDE.md | CI green |
| 3 Database | Migrations, RLS, functions, seed (reference + DEMO), pgTAP/RLS tests, concurrency test | Tests pass on dev project |
| 4 Auth & roles | OTP sign-in (test numbers), role selection, admin MFA, protected routes | Cross-account tests pass |
| 5 Frontend | Components from Figma tokens, all screens incl. §3b gaps, ur/roman/en + RTL, a11y | Visual check vs Figma frames, axe clean |
| 6 Backend API | Endpoints with Zod, OpenAPI, errors, rate limits | Integration tests pass |
| 7 Integration | Typed client, query invalidation, realtime status/messages | E2E happy paths pass |
| 8 Voice & AI | STT bake-off, adapters, extraction, consent, fallbacks, usage tracking | Live calls verified with real keys (or reported **blocked**) |
| 9 Booking & reviews | Full lifecycle, cancellation rules, disputes, reviews, stats | Concurrency + permission tests pass |
| 10 Quality | Security review, a11y audit, Lighthouse mobile, load sanity check | Findings fixed or documented |
| 11 Staging | Vercel preview + staging Supabase, migrations via CI | Full E2E on staging |
| 12 Release readiness | Monitoring, backups, rollback plan, KNOWN_LIMITATIONS | Your review |
| 13 Production | Deploy | **Your explicit approval** |

Each phase: implement → run checks → fix → report actual results → commit on a branch → PR into `main`.

## 11. Testing strategy
- **Unit (Vitest):** shared Zod schemas, state-machine helpers, i18n/RTL utilities, AI output validators.
- **Component (React Testing Library):** every Figma component's states, keyboard behaviour, RTL rendering.
- **Database (pgTAP via Supabase CLI, or SQL tests against the dev project if no Docker):** constraints, RLS per role, transition functions, the concurrency test.
- **API integration (Vitest + Supertest):** auth required, authorization (customer A vs customer B, worker vs worker), validation errors, 409 conflicts.
- **E2E (Playwright, 390×844 + 1440):** onboarding (with tap fallback), discovery, request → quote → accept → start → finish → confirm → review, cancellation, dispute; Urdu and English; axe accessibility scan per page.
- **Security:** gitleaks, `npm audit`, RLS bypass attempts, role-escalation attempts.
- **Performance:** Lighthouse CI mobile budget (initial JS ≤ ~170 KB gzip, LCP < 2.5 s on throttled 4G), Urdu font subset + `font-display: swap`, query plans for worker search.

## 12. Deployment strategy
- **Environments:** dev (local app + hosted Supabase dev or local Docker), staging (Vercel preview + Supabase staging), production (separate Supabase project, separate keys).
- **Frontend:** Vercel, preview deploy per PR.
- **API:** recommended **Vercel (separate project, Node functions)** — one platform, HTTPS, previews; Upstash for shared rate limits. Alternative: Render/Railway always-on Node if we later need long-lived connections (D2).
- **DB migrations:** applied by GitHub Actions to staging automatically, to production only after manual approval.
- **Ops:** `/health` endpoint, Sentry for frontend + API, structured logs, backups + documented restore, rollback = redeploy previous Vercel build + forward-fix migration.

## 13. Decisions

| ID | Decision | Outcome (2026-11-10) |
|---|---|---|
| D1 | Local database | **Docker Desktop + local Supabase** (`npx supabase start`). You install Docker Desktop before Phase 2/3. |
| D2 | API hosting | Vercel (separate project, Node functions) — *recommended default, not yet confirmed; can change before Phase 11.* |
| D3 | Sign-in at launch | **Email OTP first**, phone OTP later. Consequences: (a) workers need an email address — risk for low-literacy users, mitigated by allowing a helper to complete sign-in and by adding phone OTP before public launch; (b) the "Phone verified" trust item shows **"Phone not verified"** until phone OTP exists; (c) production email needs a custom SMTP sender (e.g. Resend) — Supabase's built-in mailer is rate-limited and for testing only. Recorded in KNOWN_LIMITATIONS. |
| D4 | Speech-to-text | **Bake-off first.** I build a provider-agnostic adapter; you supply ~30 consented recordings; we compare accuracy on names, areas and numbers before choosing. Voice onboarding is reported as *blocked* until a provider key exists; tap fallback (E2) works regardless. |
| D5 | Distance wording | "≈ X km to the worker's service area" (no live worker GPS) — *recommended default, not yet confirmed.* |
| D6 | Git author | Commits authored as **Sameer Abdullah**, account email, configured for this repository only. |

**Out of scope (per the hackathon problem statement):** payments, government ID verification, background checks. They stay labelled "not offered" in the UI.
