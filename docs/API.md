# Roshan Rozgar — API Specification (v1)

Status: Phase 1 design. Base URL `/v1`. The machine-readable OpenAPI 3.1 document is **generated** from the shared Zod schemas (`packages/shared`) in Phase 6 and served at `/v1/openapi.json`; this file is the human-readable contract it must match.

Reads that RLS already protects (worker search, worker profile, own jobs, messages, notifications, reference data) are done by the frontend **directly through supabase-js** (ADR-002) and are listed in §5 for completeness.

## 1. Conventions
- **Auth:** `Authorization: Bearer <Supabase access token>`. Verified with JWKS (ADR-003). `401 UNAUTHENTICATED` if missing/invalid/expired.
- **Body:** JSON, `Content-Type: application/json`, max 32 KB (audio endpoints: `multipart/form-data`, max 2 MB, ≤ 60 s).
- **Idempotency:** all `POST` state changes accept `Idempotency-Key` (uuid). Same key + same user within 24 h returns the stored response.
- **Concurrency:** state changes may send `expectedVersion`; mismatch → `409 STALE_STATE` (UI refetches).
- **Errors:** `{ "error": { "code", "message", "requestId", "fields"?: {path: msg} } }`. Messages are safe for users; details only in server logs.
- **IDs:** uuid v4, validated before any DB call.

## 2. Error codes

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod failure (`fields` filled) |
| 401 | `UNAUTHENTICATED` | no/invalid token |
| 403 | `FORBIDDEN` | wrong role / not a participant / suspended |
| 403 | `MFA_REQUIRED` | admin route without AAL2 |
| 404 | `NOT_FOUND` | resource missing **or** not visible to caller (no existence leaks) |
| 409 | `INVALID_TRANSITION` | action not allowed in current status |
| 409 | `WORKER_BUSY` | worker already has an active booking |
| 409 | `QUOTE_EXPIRED` / `QUOTE_NOT_CURRENT` | stale offer |
| 409 | `ALREADY_REVIEWED` | second review |
| 409 | `STALE_STATE` | version mismatch |
| 409 | `ROLE_ALREADY_SET` | `choose_role` twice |
| 413 | `PAYLOAD_TOO_LARGE` | body/audio too big |
| 422 | `AI_UNREADABLE` | STT/LLM produced nothing usable → client shows tap fallback |
| 429 | `RATE_LIMITED` | with `Retry-After` |
| 503 | `AI_UNAVAILABLE` | provider down/not configured → fallback |
| 500 | `INTERNAL` | anything else (logged with requestId) |

## 3. Rate limits (per user unless noted)
Default 60 req/min · state changes 20/min · `POST /jobs` 10/hour · messages 30/min · AI 20/day per user and 5/min · reports 10/day · unauthenticated health/openapi 60/min per IP. Auth OTP limits are enforced by Supabase Auth (+ CAPTCHA).

## 4. Endpoints

### Me & roles
| Method & path | Auth / authz | Request | Response | DB | Errors |
|---|---|---|---|---|---|
| `GET /v1/me` | any signed-in | — | `{id, role, displayName, preferredLang, status, isAdmin, mfaLevel, workerOnboarded?}` | profiles, admin_users | 401 |
| `POST /v1/me/role` | signed-in, role null | `{role: "customer"\|"worker"}` | `{role}` | `choose_role` | 409 ROLE_ALREADY_SET |
| `PATCH /v1/me` | signed-in | `{displayName?, preferredLang?, cityId?}` | profile | update own columns | 400 |

### Worker onboarding & profile
| Method & path | Auth / authz | Request | Response | DB | Errors |
|---|---|---|---|---|---|
| `POST /v1/workers/me/onboarding` | worker | `{displayName, categoryIds[1-6], areaIds[1-10], yearsExperience 0-60, visitFeeFrom?, workingSlots[]}` (values **as confirmed by the worker** on W4/W5) | worker profile | `complete_onboarding` | 400, 403 |
| `PATCH /v1/workers/me` | worker | same fields, all optional | worker profile | same function | 400 |
| `PUT /v1/workers/me/availability` | worker | `{status: "available"\|"offline", confirmActiveJob?: boolean}` | `{manual, effective}` | `set_availability` | 409 ACTIVE_JOB |
| `POST /v1/workers/me/photo` | worker | multipart image ≤ 1 MB (jpeg/png/webp) | `{photoUrl}` | storage | 413, 400 |

### AI (server-side only)
| Method & path | Auth / authz | Request | Response | Notes |
|---|---|---|---|---|
| `POST /v1/ai/transcribe` | signed-in, consent flag | multipart `audio` (webm/opus or mp4/aac ≤ 60 s), `lang: "ur"\|"roman"\|"en"` | `{transcript, durationSec}` | STT adapter; audio not stored; `ai_usage` row |
| `POST /v1/ai/extract-worker-profile` | worker | `{transcript ≤ 2000}` | `{name?, yearsExperience?, categories:[{id,confidence}], areas:[{id,confidence}], unclear:[field]}` | Claude structured output → Zod; areas/categories **matched to IDs server-side**; nothing saved |
| `POST /v1/ai/normalize-job` | customer | `{text ≤ 1000, lang}` | `{summary, suggestedCategoryId?, tags[]}` | shown as editable suggestion |
Errors: 422 AI_UNREADABLE, 503 AI_UNAVAILABLE, 429 RATE_LIMITED. Tests: provider mocked at the adapter boundary in CI; live smoke test only with real keys (reported, never faked).

### Jobs & negotiation (lifecycle order)
| Method & path | Caller | Request | Function | Typical errors |
|---|---|---|---|---|
| `POST /v1/jobs` | customer | `{workerId, categoryId, areaId, problemTags[≤5], problemText?, requestWindow, address{line, landmark?}, voiceNoteId?}` | `create_job_request` | 403 (worker suspended), 409 (open request exists) |
| `POST /v1/jobs/{id}/quotes` | worker of job | `{amountPkr 100-1e6, includes, arrival, note?, voiceNoteId?, expectedVersion}` | `send_quote` | 409 INVALID_TRANSITION |
| `POST /v1/quotes/{id}/counter` | customer of job | `{amountPkr}` | `counter_quote` | 409 QUOTE_EXPIRED |
| `POST /v1/quotes/{id}/accept` | counter-party | `{expectedVersion}` | `accept_quote` | **409 WORKER_BUSY**, QUOTE_EXPIRED, STALE_STATE |
| `POST /v1/quotes/{id}/decline` | counter-party | `{reason?}` | `decline_quote` | 409 |
| `POST /v1/jobs/{id}/decline` | worker | `{reason?}` | `decline_request` | 409 |
| `POST /v1/jobs/{id}/cancel` | participant | `{reason 1-300}` | `cancel_job` | 409 (after start) |
| `POST /v1/jobs/{id}/start` | worker | `{expectedVersion}` | `start_job` | 409 |
| `POST /v1/jobs/{id}/done` | worker | `{expectedVersion}` | `mark_work_done` | 409 |
| `POST /v1/jobs/{id}/confirm-completion` | customer | `{expectedVersion}` | `confirm_completion` | 409 |
| `POST /v1/jobs/{id}/problem` | customer | `{reason enum, details ≤ 1000}` | `report_problem` | 409 |
All return the updated job summary `{id, status, version, …}`, write history, and trigger a notification to the other party. Authorization is checked inside each function (caller must be the named party) **and** pre-checked in the API for clear 403s.

### Messages & voice notes
| Method & path | Caller | Request | Notes |
|---|---|---|---|
| `POST /v1/jobs/{id}/messages` | participant | `{kind: "text"\|"quick_reply", body ≤ 1000 \| quickReplyKey}` | phone-number patterns before confirmation set `flagged_contact` (moderation), not silently dropped |
| `POST /v1/jobs/{id}/voice-notes` | participant | multipart audio ≤ 60 s | stored in private bucket; optional transcript via STT; returns `{voiceNoteId}` |
| `GET /v1/voice-notes/{id}/url` | participant | — | 60 s signed URL |

### Reviews & reports
| Method & path | Caller | Request | Function | Errors |
|---|---|---|---|---|
| `POST /v1/jobs/{id}/review` | customer of completed job | `{rating 1-5, tags[], comment ≤ 1000}` | `submit_review` | 409 ALREADY_REVIEWED, INVALID_TRANSITION |
| `PATCH /v1/reviews/{id}` | author within 24 h | same | `edit_review` | 409 |
| `POST /v1/reports` | signed-in | `{targetType, targetId, reason, details?}` | insert | 404 if target not visible |

### Notifications
`POST /v1/notifications/read` `{ids[] | all:true}` — owner only.

### Admin (separate router; `is_admin` **and** AAL2)
| Method & path | Request | Effect |
|---|---|---|
| `GET /v1/admin/overview` | — | counts: active workers, open jobs, open reports, AI usage today |
| `GET /v1/admin/reports?status=&cursor=` | — | paginated queue |
| `POST /v1/admin/reports/{id}/resolve` | `{status, note}` | audit log |
| `GET /v1/admin/users?query=&cursor=` | — | minimal PII |
| `POST /v1/admin/users/{id}/status` | `{status, reason}` | suspend/reactivate + audit |
| `POST /v1/admin/reviews/{id}/moderate` | `{status, reason}` | hide/publish + audit |
| `GET /v1/admin/audit?cursor=` | — | audit log |

### Ops
`GET /v1/health` (public: `{status, version}`) · `GET /v1/health/deep` (admin: DB + provider reachability, no secrets) · `GET /v1/openapi.json`.

## 5. Direct supabase-js reads (RLS-protected, no API endpoint)
`worker_public` (search: category, area/city, effective availability, min rating, sort by rating/experience/distance via RPC `search_workers(...)` which is `SECURITY INVOKER`) · `service_categories`, `cities`, `service_areas` · own `profiles`/`worker_profiles` · `my_jobs`, `job_quotes`, `job_messages`, `job_status_history` for own jobs · `reviews` (published) · `notifications` (own) · realtime channels on `jobs`, `job_messages`, `notifications`.

## 6. Test matrix (minimum per endpoint)
1. 401 without token. 2. 403 for wrong role / non-participant (customer A on customer B's job, worker on another worker's job). 3. 400 for each invalid field class. 4. Happy path + DB side effects (history row, version bump, notification). 5. Illegal transition → 409. 6. Idempotent retry returns same response. Plus cross-cutting: concurrent `accept_quote` → exactly one success; suspended user → 403 on every write; admin route without MFA → 403 MFA_REQUIRED.
