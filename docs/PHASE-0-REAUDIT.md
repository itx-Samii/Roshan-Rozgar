# Roshan Rozgar — Phase 0 re-audit (2026-11-10)

Status: **for approval — no code changes in this phase.**
Scope: the repository as of commit `0950791` (+ uncommitted work listed in §1.4), the live Supabase project `xshmbomvxhbepbdmbhzd`, the live site `https://roshan-rozgar-omega.vercel.app`, and the Figma file `L1t1TDh9SlCttAK12X7hGU`.

This replaces the first audit (`PHASE-0-AUDIT.md`), which was written before any code existed. A time-boxed MVP has since been built and deployed, so this audit compares **what exists** against the full production brief and the hackathon problem statement (`docs/problem_statement.txt`).

---

## 0. Summary

| Area | State |
|---|---|
| Core flow (both roles, all 5 required outcomes) | **Working end to end** on the live site; tested manually with 3 test accounts |
| Booking consistency | **Strong** — enforced in Postgres (state-machine functions + partial unique index); SQL rollback tests passed |
| Real AI | **Missing.** Only the browser's built-in dictation exists. No LLM, no server-side STT. This is the biggest gap for the hackathon's 20% "Innovation and use of AI" criterion |
| Backend API (Express) | **Not built.** Business logic lives in Postgres functions called directly from the browser |
| Admin / reports / moderation | **Missing** |
| Automated tests, CI, monitoring | **Missing** (0 test files, no `.github/`) |
| Auth hardening | Email confirmation **off**, leaked-password check **off**, no password reset screen |
| Docs | README + 5 planning docs exist; SECURITY / DEPLOYMENT / TESTING / KNOWN_LIMITATIONS missing; README lacks the hackathon's required AI-tool disclosure |

**Recommendation:** do not rewrite what works. Add a small server for the things that need secrets (AI, admin), put the real AI pipeline first, then tests and hardening. Details in §4.

---

## 1. Existing codebase audit

### 1.1 Repository
- `frontend/` — Vite 7, React 19, TypeScript 5.9, Tailwind 4, React Router 7, TanStack Query 5, supabase-js 2, lucide-react. ~2,300 lines across 20 files.
- `supabase/schema.sql` — full schema + migrations 2 and 3 (applied live as `mvp_schema`, `offline_workers_not_requestable`, `profile_edit_keeps_availability`).
- `docs/` — PHASE-0-AUDIT, ARCHITECTURE, DATABASE, API, DECISIONS (ADR-001..011; written for the full plan, partly stale), problem statement (PDF + text), design-system and presentation screenshots.
- Not present: backend, tests, ESLint config, CI workflows, `.env` validation, React Hook Form, Zod.

### 1.2 What works today (verified in the browser and against the live DB)
- Landing → role choice → email/password sign-up/sign-in; "check your email" screen ready for when confirmation is enabled.
- Worker: welcome → trade cards → name (dictation) + experience/areas/fee by tapping → confirm before save; edit profile pre-filled; Available/Offline with **Busy derived** from active bookings; requests inbox (New/Quoted/Old); price picker (tap presets, ±100); start → done; reviews summary.
- Customer: location card, trade cards, worker list with filters, worker profile with honest "What we checked", request with dictation, accept via confirmation dialog, decline, confirm completion or report a problem, star rating + tags.
- Job page: journey/timeline, next-step guidance, chat with quick replies, booking ID, address hidden until confirmed (DB-enforced), map link for the worker.
- Popups for the other party's actions and new messages (5-second polling).
- Layouts: phone (bottom tabs), tablet (bottom tabs, two columns), desktop (top nav, 1200px, Figma R1/R3/R4/R5). Urdu RTL with Nastaliq line-height fix.

### 1.3 Live database (checked 2026-11-10)
- 12 tables, **RLS enabled on all 12**; 12 functions; 14 auth users (7 workers, 7 customers — **some are real sign-ups**, not only test accounts); 8 jobs across all statuses.
- Supabase security advisor: 10 warnings "SECURITY DEFINER function callable by signed-in users" — **intended** (they are the API; each checks `auth.uid()` and raises `FORBIDDEN`/`NOT_FOUND`), but must be documented; 1 warning **leaked-password protection disabled**.
- Email confirmation is **off** (every account confirmed at the instant of creation).

### 1.4 Uncommitted work found in the folder (not mine — left untouched)
- `supabase/migrations/0003_customer_counter_offers.sql` + the same block appended to `schema.sql` (new `job_counter_offers` table, `send_counter_offer`, updated `send_quote`).
- `frontend/src/pages/JobPage.tsx` + `lib/data.ts`: counter-offer UI ("Offer a different price").
- README edits describing counter-offers.
- **Risk:** the migration is **not applied** to the live DB, but the JobPage code already queries `job_counter_offers`. If this code is pushed to `main` before the migration runs, every job page on the live site will fail to load. Apply the migration first, then deploy.

---

## 2. Figma inventory

| Page | Contents |
|---|---|
| 00 Cover | 1 frame |
| 01 Foundations | colour (semantic + primitives), typography, space/radius/elevation, logo & icons |
| 02 Components | 31 component sets (Button 24 variants, Icon Button, Chip, Status Badge 18, Demo Tag, Listen Button, Text Field, Search Field, Language Switcher, Top App Bar, Bottom Nav worker/customer, Availability Toggle, Progress Stepper, Timeline Step, Voice Input 14, Voice Note, Trade Card, Rating Display/Input, Avatar, Worker Card, Trust Item, Quote Card, Request Card, Alert, Dialog, Bottom Sheet, Empty State, Toast, Demo Control) + 40 icons |
| 03 IA & Journeys | sitemap, permissions matrix, booking state machine, 2 journey maps |
| 04 Wireframes | 8 lo-fi frames |
| 05 Worker Flow | 20 frames: G1, W1–W10, W4a–c (correct fields), W8b/c, W9b/c, E1 (mic denied), E2 (tap fallback) |
| 06 Customer Flow | 18 frames: C1–C10, C6c/d/e, C9b/c/p, C10b, E6 (counter-offer) |
| 07 Edge Cases | E3 no workers, E4 worker busy, E5 counter-offer (worker), E7 network failure, E8 empty reviews, E9 loading skeleton |
| 08 Responsive | R1 desktop home, R2 tablet list, R3 desktop master–detail, R4 desktop negotiation, R5 tablet worker dashboard (RTL), R6 admin moderation (optional) |
| 09 Dev Handoff | 1 frame |

Tokens: 3 variable collections (Primitives 32, Color 41, Spacing & Radius 20), 23 text styles (EN/* and UR/*), 4 effect styles. The app's Tailwind `@theme` already mirrors the colour tokens.

### 2.1 Screens in Figma but not (fully) in the app
| Frame | Gap |
|---|---|
| W3 Voice capture → W4 "Confirm what we heard (AI-extracted)" → W4a–c correction sheets | **Core AI screens — not built.** App uses tap chips + dictation for the name only |
| W8 voice note on quote, C5/R4 voice note playback, "Listen" buttons | Not built (no audio storage, no text-to-speech) |
| Language switcher with **Roman Urdu** | App has Urdu + English only |
| E5/E6 counter-offer | In progress (uncommitted, §1.4) |
| C2 location sheet with GPS | App uses area chips only (no distance — honest, but GPS option missing) |
| Search field (C1, R1) | Not built |
| E7 network error with retry, E9 skeletons | Partial (spinners, inline alerts) |
| R6 admin moderation | Not built |
| "Report" flag on worker profile (R3/C4) | Not built |

---

## 3. Missing-feature analysis against the brief

Legend: ✅ done · 🟡 partial · ❌ missing

| Brief item | State | Notes |
|---|---|---|
| A. Urdu support | ✅ | RTL, Nastaliq font |
| A. Roman Urdu | ❌ | needs LTR language mode + strings + AI normalisation |
| A. Large trade icons, guided onboarding | ✅ | |
| A. Voice input | 🟡 | browser dictation only (Chrome/Android) |
| A. AI extraction + confirm before saving | ❌ | the headline AI feature |
| A. Fallback when voice unavailable | ✅ | everything works by tapping |
| A. Profile editing / account management | 🟡 | edit name/profile ✅; password reset ❌; delete account ❌ |
| B. Category, area, availability, experience, rating, completed jobs, sort/filter | ✅ | |
| B. Approximate distance | ❌ | area-only, labelled honestly; GPS optional later |
| C. Text + quick replies | ✅ | |
| C. Voice messages / transcripts | ❌ | |
| C. Price accept/reject | ✅ | counter-offer 🟡 |
| D. Request → quote → atomic accept → progress → cancel → complete | ✅ | DB-enforced |
| D. Double-booking prevention | ✅ | partial unique index; **no automated concurrency test yet** |
| E. Review after completion, once; ratings; counts; verified vs unverified | ✅ | |
| E. Reporting and moderation | ❌ | "problem" → `disputed` only; no reports table/admin |
| Roles: Admin | ❌ | |
| Tables: `user_reports`, `notifications`, `audit_logs` | ❌ | `customer_profiles`, `worker_availability`: not needed (see §5) |
| Express API, OpenAPI, rate limiting | ❌ | see §4 decision |
| React Hook Form + Zod, error boundary, skeletons | ❌/🟡 | forms are small; add Zod at the API boundary first |
| Tests (Vitest, RTL, Playwright, API) | ❌ | |
| CI, error monitoring, health checks | ❌ | |
| Separate dev/prod environments | ❌ | one Supabase project serves both |
| Docs: SECURITY, DEPLOYMENT, TESTING, KNOWN_LIMITATIONS | ❌ | |
| README hackathon requirements (AI services list, AI coding assistant disclosure, seeded/mocked list) | 🟡 | AI disclosure missing |

---

## 4. Proposed final architecture

### 4.1 Decision needed: where business logic lives
The brief asks for an Express API in front of everything. Today the browser calls Postgres functions directly (Supabase RPC), and **those functions are the security boundary**: every write goes through a `SECURITY DEFINER` function that checks `auth.uid()`, locks the row and validates the transition; reads go through RLS.

**Option A — Hybrid (recommended).** Keep Postgres functions + RLS as the single source of truth for bookings, quotes, reviews and availability. Add a small **Node/TypeScript Express API** only for work that needs a secret or a third-party call:
- `/api/ai/*` — speech-to-text and Claude extraction (needs API keys).
- `/api/admin/*` — moderation actions (needs the service-role key).
- `/api/reports`, `/api/health`.

*Why:* the booking rules are already enforced and tested in one place. A second copy in Express would add a network hop, double the authorisation code, and create a way for the two to disagree. Judges weight reliability over feature count (30%).

**Option B — Full Express facade.** Every endpoint goes through Express, which calls the same Postgres functions with the user's JWT. More code, more latency, the same guarantees. Choose this only if the brief's "Express for all endpoints" is a hard requirement.

Hosting for the API, either option: **Vercel Functions** in the same Vercel project (one deploy, same domain, no CORS) — to be confirmed in Phase 2 against Vercel's current Node/Express docs; fallback is Render or Railway.

### 4.2 Target shape (Option A)
```
Browser (React, Vite)  ──supabase-js (publishable key, user JWT)──►  Supabase Postgres (RLS + functions)
        │                                                               ▲
        └──fetch /api/* (Bearer user JWT)──► Express on Vercel Functions ┘ (verifies JWT; service role only for admin)
                                                 ├─► Speech-to-text provider (audio → text)
                                                 └─► Claude API (text → validated JSON)
```

---

## 5. Database entity plan

Existing (keep): `profiles`, `worker_profiles`, `worker_services`, `worker_areas`, `service_categories`, `service_areas`, `jobs`, `job_private`, `job_quotes`, `job_messages`, `job_status_history`, `reviews` (+ `job_counter_offers` once applied).

Add:
| Table | Purpose | Key constraints |
|---|---|---|
| `user_reports` | report a user, review or job | reporter = `auth.uid()`; one open report per (reporter, target); status `open/reviewing/resolved/dismissed` |
| `audit_logs` | admin and sensitive actions | insert-only via functions; actor, action, target, reason, created_at; no update/delete grants |
| `notifications` | persisted alerts (replaces client-side polling diff) | user_id, kind, job_id, read_at; RLS = own rows |
| `ai_extractions` | what the AI heard and proposed, and what the user confirmed | user_id, transcript, proposed JSON, confirmed JSON, model, tokens, latency; **no audio stored** |
| `admins` (or `profiles.is_admin` set only by SQL) | admin role | never writable by clients |

Not adding, with reasons: `customer_profiles` (customers have no extra fields yet); `worker_availability` (availability = one column + **derived** busy; a separate table would let the two drift).

Invariants (documented in `DATABASE.md`): one active booking per worker (partial unique index); one open request per customer–worker pair; one pending quote per job; one review per job, only after `completed`; address readable by the worker only after `confirmed`; every status change written to `job_status_history`.

---

## 6. Authentication and roles

- Supabase Auth, email + password (as today). Turn on: **Confirm email**, **leaked-password protection**, custom SMTP, Site URL/redirects for the Vercel domain.
- Add password reset ("Forgot password?" → email link → set new password screen).
- Phone OTP: **not available** without an SMS provider (Twilio etc.). Disclose it in the README; do not show "phone verified".
- Roles: `customer`/`worker` chosen once by `choose_role` (cannot be changed by the client). `admin` assigned only by SQL by a project owner; checked in Postgres and in the Express admin routes.
- Express verifies the Supabase JWT on every request; never trusts a role sent by the client.

---

## 7. AI integration plan

### 7.1 Worker voice onboarding (Figma W3 → W4 → W4a–c)
1. Worker taps the mic; the browser asks for permission; a short explainer says what happens to the audio.
2. Browser records audio (MediaRecorder) and sends it to `POST /api/ai/transcribe`.
3. Server sends audio to a **speech-to-text** provider and returns the transcript. Audio is not stored.
4. Server sends the transcript to **Claude** with a fixed list of trades and Lahore areas, and asks for JSON: `{ name, trades[], years_range, areas[], visit_fee }`, each with a confidence value. Unknown → `null`, never a guess.
5. Server validates the JSON against a Zod schema and maps names to real category/area IDs.
6. The app shows W4 "Confirm what we heard"; each field can be corrected by tapping (W4a–c sheets). **Nothing is saved until the worker taps Confirm**, and saving still goes through `complete_onboarding`.
7. If STT or Claude fails or times out (e.g. 8 s), the app falls back to the existing tap-based flow (E2) and says so.

### 7.2 Other AI uses (in priority order)
- Job request: Roman Urdu / Urdu text → short summary + suggested trade (customer can change it).
- Chat: voice note → transcript shown under the message.

### 7.3 Model and provider
- **LLM:** Claude Opus 5.5 (`claude-opus-5-5`) via the official `@anthropic-ai/sdk`, server-side only. Structured output with `output_config.format` (JSON schema) and validation with Zod. Effort set to `low` (default is `medium`) to keep latency down, since this is short extraction. Server-side refusal fallback enabled. A cheaper model (Claude Haiku 5.5) is possible if cost matters — your decision.
- **Speech-to-text:** Claude does not accept audio, so a separate provider is needed. Run a quick bake-off on ~10 recorded Urdu / Roman Urdu samples (the ADR from Phase 1) and pick by accuracy and latency. The browser's free Web Speech API stays as the fallback.
- Guardrails: rate limit (e.g. 10 AI calls per user per hour), log token usage and latency per call in `ai_extractions`, never send email/address to the AI, never let AI output change a booking, price or verification status.

---

## 8. External services and credentials

| Service | Variable | Where it lives | Status |
|---|---|---|---|
| Supabase URL + publishable key | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend `.env.local`, Vercel env | ✅ set |
| API base URL | `VITE_API_BASE_URL` | frontend | needed with the API (empty = same origin) |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | server env only (Vercel, not `VITE_`) | needed for admin — **you add it in Vercel; never paste it in chat** |
| Claude API | `ANTHROPIC_API_KEY` | server env only | **blocked until you add it** |
| Speech-to-text | provider key (after bake-off) | server env only | **blocked until chosen and added** |
| Allowed origins | `ALLOWED_ORIGINS` | server env | set in Phase 2 |
| SMTP (for confirmation emails) | in Supabase dashboard | Supabase | **you configure** |
| Error monitoring (optional) | e.g. `SENTRY_DSN` | env | optional |

---

## 9. Security risks (ranked)

1. **Deploying the uncommitted counter-offer code before its migration** → live job pages break (§1.4).
2. **Email confirmation off** → anyone can register with someone else's email.
3. **Real users and test data in the same database**, no separate staging project → testing touches production data.
4. **AI endpoints without rate limits** → cost abuse once keys are added.
5. **Leaked-password protection off.**
6. **No reporting/moderation** → abusive reviews or users can't be handled.
7. Prompt injection via transcripts → mitigated by schema-only output, ID mapping and human confirmation.
8. `SECURITY DEFINER` functions are the API → each must keep its `auth.uid()` check; add automated tests so a future edit can't drop one.
9. No dependency or secret scanning in CI.

---

## 10. Phase checklist

| Phase | Status | Remaining work |
|---|---|---|
| 0 Audit | ✅ this document | approval |
| 1 Architecture | 🟡 docs exist, stale | update ARCHITECTURE/DECISIONS for Option A or B |
| 2 Dev environment | 🟡 | Supabase **staging** project, `.env.example` for server, env validation, ESLint, API skeleton |
| 3 Database & authorisation | 🟡 | reports, audit_logs, notifications, ai_extractions, admin flag; counter-offer migration |
| 4 Auth & roles | 🟡 | password reset, confirm email + SMTP, admin role, leaked-password check |
| 5 Figma frontend | 🟡 | W3/W4 voice screens, Roman Urdu, skeletons (E9), network-error retry (E7), report button, admin screens (R6) |
| 6 Backend API | ❌ | Express: health, AI, admin, reports; Zod; OpenAPI; rate limits; logging |
| 7 Integration | 🟡 | typed API client; error mapping |
| 8 Voice & AI | ❌ | STT bake-off, Claude extraction, confirm/correct flow, job summary, fallbacks — **blocked on keys** |
| 9 Booking & reviews | ✅ core | automated concurrency test; counter-offer |
| 10 Tests, a11y, security | ❌ | Vitest/RTL, Playwright E2E both roles, SQL/RLS tests, axe checks, `npm audit`, secret scan |
| 11 Staging deploy | ❌ | preview deployments against the staging DB |
| 12 Release readiness | ❌ | SECURITY/DEPLOYMENT/TESTING/KNOWN_LIMITATIONS, README AI disclosure, rollback plan |
| 13 Production deploy | ✅ MVP live | each later release needs your approval |

**Suggested order for the hackathon:** Phase 8 (real AI onboarding) → Phase 10 (E2E tests for the demo flow) → Phase 12 (README disclosures) — these are what judges score. Admin/moderation (R6 is "optional" in Figma) comes after.

---

## 11. Testing strategy
- **Database:** SQL tests in transactions that roll back (pattern already used): role escalation, cross-account reads, address privacy, every invalid transition, duplicate review, **two customers confirming the same worker at once** (two sessions, one must get `WORKER_BUSY`).
- **API:** Vitest + supertest: JWT required, admin-only routes, Zod rejection, AI timeout → fallback response, rate-limit 429.
- **Frontend:** Vitest + React Testing Library for price picker, language switch (sets `dir=rtl`), forms, error states; axe accessibility checks.
- **End to end:** Playwright, two browser contexts (worker + customer) running the full flow on a phone viewport and a desktop viewport.
- **CI:** GitHub Actions on every push: typecheck, lint, unit, build, `npm audit`, secret scan; Playwright on pull requests against staging.

## 12. Deployment strategy
- Two Supabase projects: **staging** (tests, previews) and **production** (current one).
- Vercel: preview deployments per branch → staging DB; `main` → production. Server keys set per environment in Vercel.
- Migrations: numbered files in `supabase/migrations/`, applied to staging first, then production after approval; each with a written rollback.
- Health check `/api/health`; error monitoring; Supabase daily backups (check the plan's backup window); rollback = Vercel "promote previous deployment" + reverse migration.

---

## 13. Hackathon compliance notes
- README must list **every AI service** and disclose **AI coding assistants** (Claude Code was used) — currently missing.
- README must state what is **seeded or simulated** (test accounts, Lahore areas, demo jobs).
- Presenting mocked features as working is penalised: keep "not verified" labels and never label dictation as "AI".
- Check that the repository's first commit is after the official start time (rules §6/§8).
