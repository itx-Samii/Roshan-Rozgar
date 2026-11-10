# Roshan Rozgar · روشن روزگار

Bilingual (اردو RTL / English) marketplace connecting skilled trade workers with nearby customers in Pakistan.
Design: [Figma](https://www.figma.com/design/L1t1TDh9SlCttAK12X7hGU) · Plan & decisions: [docs/](docs/)

## What works (MVP)
- Sign up / sign in (email + password), one-time role choice (worker or customer).
- Worker onboarding: trade cards → name (voice dictation or typing) + experience/areas/fee by tapping → **confirm before saving**.
- Worker dashboard: Available / Offline; **Busy is automatic** while a booking is active.
- Customer: pick trade + area → available workers first, busy ones explained → request with problem (voice or text) + address.
- Negotiation: worker sends price → customer **accepts via confirmation dialog** or declines → worker starts → marks done → **customer confirms** (or reports a problem) → review (only after completion, once).
- Messages per job. Address is shown to the worker **only after the booking is confirmed** (database-enforced).
- No double booking: enforced by a unique index in Postgres (`uniq_active_booking_per_worker`).

## Setup (≈10 minutes, no installs beyond Node)
1. **Supabase:** create a free project at supabase.com → *SQL Editor* → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run.
2. *Authentication → Sign In / Providers → Email*: for a quick demo turn **off "Confirm email"** (the free built-in mailer is rate-limited).
3. *Project Settings → API Keys*: copy the **Project URL** and the **publishable** key (`sb_publishable_…`). Never use the secret key in the frontend.
4. `cd frontend && cp .env.example .env.local`, fill both values, then `npm install && npm run dev` → http://localhost:5173
5. **Deploy:** vercel.com → *Add New Project* → import this GitHub repo → **Root Directory: `frontend`** → add the same two env vars → Deploy.

Test with two browsers (or one normal + one private window): one worker account, one customer account.

## Known limitations (honest status)
- Voice uses the browser's built-in speech recognition (best in Chrome/Android, `ur-PK`); no server AI yet. Tap/typing always works.
- Email + password sign-in for the MVP; email OTP / phone OTP are planned (docs/DECISIONS.md ADR-004).
- No identity verification, no payments (cash after job) — stated in the UI.
- Express API, AI extraction, admin moderation, automated tests and CI from the full plan are **not built yet**.
- Updates use 4–5 s polling rather than realtime.
