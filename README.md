# Roshan Rozgar · روشن روزگار

A bilingual (اردو right-to-left / English) web marketplace that connects skilled trade workers — electricians, plumbers, AC technicians, mechanics, carpenters, painters — with nearby households in Pakistan. Built for workers who don't read or type comfortably: they choose their trade by picture, **say** their details, and confirm what the app heard.

- **Live demo:** https://roshan-rozgar-omega.vercel.app
- **Design:** [Figma](https://www.figma.com/design/L1t1TDh9SlCttAK12X7hGU)
- **Problem statement:** CUI Tech Fest · AI Web Forge hackathon — Roshan Rozgar
- **Plans and decisions:** [docs/](docs/) — architecture, decision records (ADR-012: hybrid design), audit

## The five required outcomes

| Outcome | How it works in this app |
|---|---|
| **Onboarding** without a typed form | Worker taps a trade picture, then speaks one sentence ("میرا نام … ہے، 8 سال سے کام کر رہا ہوں، گلبرگ میں"). The app fills name, years and areas, shows *Is this correct?*, and saves only after the worker confirms. Every field can also be chosen by tapping. |
| **Discovery** of a nearby, available worker | Customer picks a trade and an area. Workers who serve that area are listed, available first; busy workers are shown with the reason; offline workers are hidden. Filters: available now, 4★ and up, best rated. |
| **Communication** without typing | Worker sends a price by tapping preset amounts (± Rs 100) and parts/labour; the customer accepts or declines. Chat has one-tap quick replies and voice dictation. "Listen" buttons read screens aloud. |
| **Booking** stays consistent | Accepting a price confirms the booking inside one database transaction; a unique index makes a second active booking for the same worker impossible, and the worker shows as Busy until the job ends. |
| **Trust** for the next customer | After the customer confirms the job is done, they rate 1–5 stars with tags and a comment — once per job, only after completion. Profiles show rating, completed jobs and an honest "What we checked" list. |

## How AI and voice are used today (honest status)

| Feature | What it uses | Status |
|---|---|---|
| Speech to text (worker sign-up, problem description, chat) | The browser's built-in **Web Speech API** (Urdu `ur-PK`; English `en-IN` for sign-up, `en-US` elsewhere). In Chrome this sends audio to Google's speech service. | **Working** in Chrome and on Android; tap fallback everywhere else |
| Filling profile fields from the spoken sentence | **Deterministic word matching** (`frontend/src/lib/voiceParse.ts`) for Urdu script, Roman Urdu and English trade/area names, numbers and "mera naam … hai" patterns | **Working; not AI.** The UI says so. |
| Read aloud ("سنیں / Listen") | The device's **text-to-speech** (`speechSynthesis`) | **Working** where the device has a voice for the language; it says so when no Urdu voice is installed |
| Understanding free-form speech (profile extraction, job summary, trade suggestion) | **Claude API** (`claude-opus-5-5`, server-side, JSON output validated with Zod) — planned in `frontend/server/` | **Not active yet** — waiting for an API key. `/api/health` reports `ai_llm: false` until it is configured |

Nothing the app fills in automatically is saved without the user's confirmation, and no AI output can change a booking, a price or a verification status.

## AI services and tools used (disclosure)

**In the product**
- Web Speech API (browser speech recognition; Google speech service in Chrome) — speech to text.
- Device text-to-speech (`speechSynthesis`) — read aloud.
- Anthropic Claude API — integrated in the plan and API skeleton, **not yet active** (no key configured).

**To build the product**
- **Claude Code** (Anthropic; model Claude Opus 5.5) was used as an AI coding assistant to write application code, SQL, tests and documentation, and to build the Figma design file through the Figma MCP integration. The team directed, reviewed and tested the work.

## What is seeded, simulated or mocked

- **Reference data:** 6 trades and 10 Lahore areas are seeded (`supabase/schema.sql`).
- **Demo accounts:** test accounts with emails `rr.test.*@example.com` (one worker, two customers) and their jobs and reviews are test data. Passwords are not published here; ask the team.
- **Other accounts** in the live database are real sign-ups from testing the deployed site.
- **Not real:** payment (the app says "cash after the job"), identity verification (profiles state that phone, CNIC and background are **not** verified), distances (the app shows service areas, not kilometres).
- **Notifications** are pop-ups from polling every 5 seconds while the app is open — no push notifications or SMS.

## Tech stack

- **Frontend:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5, lucide-react. Fonts: Plus Jakarta Sans, Noto Nastaliq Urdu (Google Fonts).
- **Database and auth:** Supabase (Postgres + Row Level Security + Auth). Business rules live in `SECURITY DEFINER` Postgres functions.
- **API:** Express 5 on Vercel Functions (`frontend/api/index.ts`, code in `frontend/server/`), Zod validation, JWT verified with the project's public keys.
- **Hosting:** Vercel (site + API), Supabase (database).
- **Tests:** Vitest + supertest (`npm test`).

## Setup (about 10 minutes)

1. **Supabase:** create a project → *SQL Editor* → run all of [`supabase/schema.sql`](supabase/schema.sql).
2. *Authentication → Sign In / Providers → Email*: for a quick demo, turn **off** "Confirm email" (the built-in mailer is rate-limited). For real use, turn it on and connect your own SMTP.
3. *Project Settings → API Keys*: copy the **Project URL** and the **publishable** key (`sb_publishable_…`). Never put the secret key in the frontend.
4. `cd frontend && cp .env.example .env.local`, fill both values, then:
   - `npm install`
   - `npm run dev` → http://localhost:5173 (the site)
   - `npm run api` → http://localhost:3001 (the API; the site forwards `/api` to it)
   - `npm test` (unit and API tests) · `npm run typecheck`
5. **Deploy:** Vercel → *Add New Project* → import the repo → **Root Directory: `frontend`** → add the two `VITE_` variables → Deploy. Server-only keys (e.g. `ANTHROPIC_API_KEY`) go in Vercel's environment variables **without** the `VITE_` prefix.

Test with two browsers (or one normal + one private window): one worker account, one customer account.

## Known limitations

- Claude-based understanding of free-form speech is not active yet (needs an API key); profile fields are filled by word matching.
- Voice input needs Chrome or Android; Urdu read-aloud needs a device with an Urdu text-to-speech voice.
- Email + password sign-in; no password reset screen, no phone OTP.
- No admin or moderation area and no report button yet; "There's a problem" marks the job as disputed.
- Customers can't yet offer a different price (counter-offer is in progress).
- No Roman Urdu interface language (Urdu and English only).
- One Supabase project is used for both testing and the live site.
- Automated end-to-end tests and CI are not set up yet; testing so far is unit/API tests plus manual end-to-end runs.

## Credits

Open-source libraries: React, Vite, Tailwind CSS, React Router, TanStack Query, supabase-js, Express, Zod, lucide-react, Vitest, supertest, tsx. Fonts: Plus Jakarta Sans and Noto Nastaliq Urdu (SIL Open Font License).
