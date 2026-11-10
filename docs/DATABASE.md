# Roshan Rozgar — Database Design (Supabase Postgres)

Status: Phase 1 design. Implemented as forward-only migrations in `supabase/migrations/` in Phase 3. All primary keys are `uuid` (`gen_random_uuid()`) unless noted; all tables have `created_at timestamptz not null default now()` and, where mutable, `updated_at` maintained by trigger.

## 1. Enums

| Enum | Values |
|---|---|
| `app_role` | `customer`, `worker` (admin is **not** a role value — see `admin_users`) |
| `lang_code` | `ur`, `roman`, `en` |
| `account_status` | `active`, `suspended` |
| `manual_availability` | `available`, `offline` |
| `job_status` | `requested`, `quoted`, `confirmed`, `in_progress`, `awaiting_confirmation`, `completed`, `cancelled`, `disputed`, `expired` |
| `quote_status` | `pending`, `accepted`, `declined`, `countered`, `expired`, `withdrawn` |
| `quote_party` | `worker`, `customer` |
| `price_includes` | `visit_labour`, `visit_labour_parts` |
| `arrival_window` | `within_30m`, `within_1h`, `today_evening`, `tomorrow` |
| `request_window` | `now`, `today_evening`, `tomorrow` |
| `message_kind` | `text`, `quick_reply`, `voice`, `system` |
| `report_target` | `user`, `review`, `job`, `message` |
| `report_status` | `open`, `in_review`, `resolved`, `dismissed` |
| `review_status` | `published`, `hidden` |

## 2. Tables

### Reference data (readable by everyone, writable by migrations/admin only)
- **cities**(id, slug unique, name_ur, name_roman, name_en, active bool)
- **service_areas**(id, city_id → cities, slug, name_ur, name_roman, name_en, centroid `geography(Point,4326)`, unique(city_id, slug)); GIN trigram index on names for AI area matching.
- **service_categories**(id, slug unique, name_ur, name_roman, name_en, icon text, sort int, active bool)

### Identity
- **profiles**(id uuid PK = `auth.users.id` ON DELETE CASCADE, role app_role **null until chosen**, display_name text check 1–80 chars, preferred_lang lang_code default `ur`, city_id → cities, status account_status default `active`, is_demo bool default false)
- **admin_users**(user_id PK → profiles, granted_by → profiles, granted_at) — no client write path at all.
- **customer_profiles**(user_id PK → profiles, default_area_id → service_areas)
- **worker_profiles**(user_id PK → profiles, years_experience smallint check 0–60, visit_fee_from int check 0–100000 null, working_slots text[] check ⊆ {morning,afternoon,evening,night}, manual_availability default `offline`, onboarding_completed_at, photo_path text null, bio text check ≤ 280)
- **worker_services**(worker_id → worker_profiles, category_id → service_categories, PK both)
- **worker_service_areas**(worker_id → worker_profiles, area_id → service_areas, PK both)

### Jobs & negotiation
- **jobs**(id, customer_id → profiles, worker_id → profiles, category_id, area_id, status job_status default `requested`, problem_tags text[] ≤ 5, problem_text text ≤ 500, request_window, voice_note_path null, transcript text ≤ 2000 null, accepted_quote_id → job_quotes null, version int default 1, requested_at, quoted_at, confirmed_at, started_at, worker_done_at, completed_at, cancelled_at, cancelled_by, cancel_reason text ≤ 300, check customer_id <> worker_id)
- **job_private_details**(job_id PK → jobs ON DELETE CASCADE, address_line text 5–200, landmark text ≤ 120, location `geography(Point)` null)
- **job_quotes**(id, job_id → jobs, proposed_by quote_party, author_id → profiles, amount_pkr int check 100–1,000,000, includes price_includes, arrival arrival_window null, note text ≤ 300, voice_note_path null, transcript null, status quote_status default `pending`, expires_at timestamptz, responded_at)
- **job_messages**(id, job_id → jobs, sender_id → profiles, kind message_kind, body text ≤ 1000, quick_reply_key text null, voice_path null, transcript null, flagged_contact bool default false)
- **job_status_history**(id bigint identity, job_id, from_status, to_status, actor_id, reason text null, created_at) — insert only via functions.

### Trust & operations
- **reviews**(id, job_id **unique** → jobs, customer_id, worker_id, rating smallint check 1–5, tags text[] ⊆ allowed set, comment text ≤ 1000, status review_status default `published`, editable_until timestamptz = created_at + 24h)
- **worker_stats**(worker_id PK, completed_jobs int, review_count int, rating_sum int, avg_rating numeric(2,1) generated) — maintained by triggers on jobs/reviews.
- **user_reports**(id, reporter_id, target_type report_target, target_id uuid, reason text (enum-like check), details text ≤ 1000, status report_status default `open`, assigned_admin null, resolution_note, resolved_at)
- **notifications**(id, user_id, type text, payload jsonb, read_at null)
- **audit_logs**(id bigint identity, actor_id, actor_kind text, action text, target_type, target_id, metadata jsonb, created_at) — append-only.
- **ai_usage**(id, user_id, feature text, provider text, model text, input_tokens int, output_tokens int, audio_seconds numeric, latency_ms int, status text, error_code text null)
- **idempotency_keys**(key text, user_id, endpoint text, response jsonb, created_at, PK(user_id, key)) — 24 h retention.

## 3. Indexes (beyond PKs/uniques)

| Index | Purpose |
|---|---|
| `uniq_active_booking_per_worker` on `jobs(worker_id) WHERE status IN ('confirmed','in_progress','awaiting_confirmation')` | **No double booking** |
| `uniq_open_job_customer_worker` on `jobs(customer_id, worker_id) WHERE status IN ('requested','quoted')` | One open request per customer→worker pair |
| `uniq_pending_quote_per_job` on `job_quotes(job_id) WHERE status='pending'` | One live offer at a time |
| `uniq_accepted_quote_per_job` on `job_quotes(job_id) WHERE status='accepted'` | One agreed price |
| `jobs(worker_id, status)`, `jobs(customer_id, status)`, `job_messages(job_id, created_at)`, `notifications(user_id, read_at)`, `job_quotes(expires_at) WHERE status='pending'` | Inbox / list / expiry queries |
| `worker_service_areas(area_id)`, `worker_services(category_id)` | Discovery filters |
| GIST on `service_areas.centroid` | Distance ordering |

## 4. Views
- **worker_public** (security-barrier view for discovery): worker id, display_name, trades, areas, years_experience, visit_fee_from, effective_availability (`busy` if active booking else manual), stats, `phone_verified` (from `auth.users.phone_confirmed_at`, false until phone OTP exists), is_demo. Excludes email/phone/suspended accounts.
- **my_jobs** convenience view filtered by `auth.uid()`.

## 5. Row-level security (deny by default; `auth.uid()` = caller)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| cities, service_areas, service_categories | everyone (anon + authenticated) | — | — | — |
| profiles | own row; admins | via `handle_new_user` trigger only | own `display_name, preferred_lang, city_id` only (column privileges) | — |
| admin_users | own row (to know you're admin); admins | — | — | — |
| customer_profiles | own | own | own | — |
| worker_profiles / worker_services / worker_service_areas | own (full); public fields via `worker_public` view | own (worker role) | own, **except** availability via function | own (services/areas) |
| jobs | customer or worker of the job; admins | via `create_job_request()` only | **none** (functions only) | — |
| job_private_details | customer always; worker **only when status ∈ confirmed/in_progress/awaiting_confirmation/completed** | via function | customer, before confirmed | — |
| job_quotes | job participants | via functions | none | — |
| job_messages | job participants | participants, job not completed/cancelled > 7 days, `sender_id = auth.uid()` | — | — |
| job_status_history | job participants; admins | — | — | — |
| reviews | published: everyone; hidden: author + admins | via `submit_review()` | via `edit_review()` within 24 h | — |
| worker_stats | everyone | — | — | — |
| user_reports | reporter; admins | reporter = self | admins (status) via function | — |
| notifications | owner | functions/privileged | owner (`read_at` only) | owner |
| audit_logs | admins with AAL2 | functions only | — | — |
| ai_usage | admins | API privileged module | — | — |

Admin predicate: `is_admin()` = exists in `admin_users` **and** `auth.jwt()->>'aal' = 'aal2'` (MFA). Suspended users: every write function checks `profiles.status = 'active'`.

## 6. Functions (SECURITY DEFINER, `search_path = ''`, fully qualified names)

| Function | Caller | Transition / effect | Key checks |
|---|---|---|---|
| `choose_role(role app_role)` | new user | sets `profiles.role` once; creates customer/worker profile | role currently null |
| `set_availability(status manual_availability)` | worker | updates manual availability | own worker profile; going `offline` while active booking → error `ACTIVE_JOB` unless `p_confirm` |
| `complete_onboarding(payload jsonb)` | worker | writes trades, areas, years, fee, slots; sets onboarding_completed_at | areas/categories exist; values in range |
| `create_job_request(worker, category, area, tags, text, window, address, landmark)` | customer | → `requested`; private details row | worker active + offers category; no open request to same worker |
| `send_quote(job, amount, includes, arrival, note)` | worker of job | `requested→quoted` (or new quote after counter); previous pending → `countered`/`withdrawn`; expires_at = now()+30 min | job state, single pending |
| `counter_quote(quote, amount)` | customer of job | pending worker quote → `countered`; new pending customer quote | quote current, not expired |
| `accept_quote(quote, expected_version)` | the party who did **not** author the quote | `quoted→confirmed`; quote `accepted`; job.accepted_quote_id | lock job; version match; not expired; unique index → `WORKER_BUSY` |
| `decline_quote(quote, reason)` | counter-party | quote `declined`; job back to `requested` (worker may re-quote) or `cancelled` if customer chooses | — |
| `decline_request(job, reason)` | worker | `requested/quoted → cancelled` | — |
| `cancel_job(job, reason)` | customer or worker | `requested/quoted/confirmed → cancelled` | not after `in_progress` |
| `start_job(job)` | worker | `confirmed → in_progress` | — |
| `mark_work_done(job)` | worker | `in_progress → awaiting_confirmation` | worker stays busy (index still matches) |
| `confirm_completion(job)` | customer | `awaiting_confirmation → completed`; stats +1 | — |
| `report_problem(job, reason, details)` | customer | `awaiting_confirmation → disputed`; creates user_report | — |
| `submit_review(job, rating, tags, comment)` | customer | inserts review; stats updated | job `completed`; caller is customer; unique(job) |
| `edit_review(review, …)` | author | update within 24 h | editable_until |
| `expire_stale_quotes()` | pg_cron every minute | pending past expires_at → `expired`; job back to `requested` | — |
| `admin_set_account_status(user, status, reason)` | admin AAL2 | suspend/reactivate; audit log | — |
| `admin_moderate_review(review, status, reason)` | admin AAL2 | hide/publish; audit log | — |
| `admin_resolve_report(report, status, note)` | admin AAL2 | audit log | — |

Every transition writes `job_status_history`, bumps `jobs.version`, and raises typed errors `RRxxx_CODE` that the API maps to HTTP codes (see API.md §2).

## 7. Business invariants (tested in Phase 3/9)
1. A worker has at most one job in `confirmed | in_progress | awaiting_confirmation`.
2. A job has at most one pending and at most one accepted quote; a quote is accepted only by the counter-party.
3. Status only moves along the state machine; history is append-only and complete.
4. A review exists only for a `completed` job, by its customer, once.
5. A worker never reads a customer's address before the job is confirmed; no user reads another user's email/phone.
6. Users cannot change their own role or status; admin capability requires `admin_users` + MFA.
7. `worker_stats` equals recomputation from `jobs`/`reviews` (checked by a test).

**Concurrency assumptions:** Postgres default `READ COMMITTED`; transition functions take `SELECT … FOR UPDATE` on the job row; cross-job conflicts for the same worker are resolved by the partial unique index (first commit wins, the other raises `unique_violation` → `WORKER_BUSY`). Required test: N parallel `accept_quote` calls for different jobs of one worker → exactly one `confirmed`.

## 8. Storage buckets (private)
- `voice-notes/{job_id}/{uuid}.webm|m4a` — participants of the job can read via signed URL (60 s); deleted 30 days after job closes (scheduled function).
- `worker-photos/{user_id}.webp` — owner write; public read only through `worker_public` signed URL; max 1 MB.
- Onboarding audio is **never stored** (processed in memory by the API).

## 9. Migrations, seed, backup
- Naming `YYYYMMDDHHMMSS_<topic>.sql`; forward-only; each file has a header comment with its rollback approach.
- `seed.sql`: Lahore + 10 areas with centroids, 6 trades (from Figma), and — local/staging only — DEMO workers/customers with `is_demo = true`.
- Backups: Supabase daily backups (Pro plan); PITR decision before production (cost). Restore procedure documented in DEPLOYMENT.md (Phase 12).
