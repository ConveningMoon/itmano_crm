<p align="center">
  <img src="public/itmano_logo.webp" alt="ITMANO" width="96" />
</p>

<h1 align="center">ITMANO CRM</h1>

<p align="center">
  The live dashboard that replaces the monthly PDF report.<br />
  A white-labeled, multi-tenant CRM built for real estate growth teams.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="Vercel" src="https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Proprietary-lightgrey">
</p>

---

## What this is

Most agencies hand a real estate team a PDF once a month. **ITMANO hands them a live dashboard.**

ITMANO CRM is the product face of ITMANO's Growth Partner service: acquisition, lead scoring, nurturing, and conversion, all wired together behind one branded login at `app.itmano.com`. Every tenant sees their own pipeline update in real time — no refresh, no waiting for a report — while the scoring engine underneath does the prioritization a human would otherwise do by hand.

It is sold sales-led ("Contáctanos," no self-serve signup) on three plans — **Esencial**, **Growth**, and **Partner** — each new client starting on a 14-day trial at the Growth tier. See [`src/lib/plans.ts`](src/lib/plans.ts) for the current pricing and feature matrix, and [`/planes`](src/app/(marketing)/planes) for the public comparison page.

## Why it's different

The differentiator isn't the CRM feature list — it's that the score on a lead's card is *earned*, not guessed:

- **Automatic lead scoring (0–100).** Source baseline + weighted behavioral events + time-decay, driving pipeline status without a human touching it. Apple Mail's tracking-pixel pre-fetch means email opens are logged but barely move the needle (+2) — clicks, replies, and form submissions are the real signal.
- **Frozen-score funnel.** Once a lead enters an active deal (`en_proceso` → `cerrado`), scoring stops. A closed contact who suddenly clicks a newsletter link re-enters the funnel automatically.
- **Postgres does the work.** Triggers score events on insert; an hourly cron applies half-life decay. The UI reads one column (`current_score`) — no joins, no aggregates, fully indexable.

The full model — weights, decay formula, status bands, trigger flow — is documented in [`CLAUDE.md`](CLAUDE.md#lead-scoring-model).

## Inside the dashboard

| Area | What it does |
|---|---|
| **Pipeline** | Leads grouped by score-driven status, KPI cards, Supabase Realtime — the board updates itself. |
| **Leads** | List, filters, detail, manual entry, CSV/XLSX import (up to 500 rows), language-based agent auto-routing. |
| **Email nurturing** | Per-agent Resend sequences with AI-drafted bootstrap steps, in-CRM AI composer, inbound reply capture, bounce/spam/unsubscribe guards. Click rate is the trusted engagement metric — never opens. |
| **Properties** | Listings CRUD with Supabase Storage media, doubling as the data source for the tenant's public website via a locked-down anonymous read policy. |
| **Acquisition channels** | Lead magnets, event forms, contact forms, and Webflow/ManyChat intake endpoints — deduplicated and scored on arrival. |
| **Analytics** | Per-agent, per-channel, and email-engagement views; platform-wide KPIs in the super-admin hub. |
| **Notifications** | In-app bell + Telegram, firing on a score crossing 80 or a qualified contact-form submission. |
| **Admin** | Tenant management, platform KPIs, and an "act as tenant" switcher for support. |

**AI, on the clock.** The Anthropic SDK (`claude-sonnet-5`) drafts and rewrites emails in each agent's voice, bootstraps empty sequences, and extracts a prefillable listing from a PDF. Every call is metered per tenant in `ai_usage_events` — since ITMANO foots the AI bill, that ledger is what keeps pricing honest.

## Architecture at a glance

```
Browser
  │
  ▼
Next.js 16 (App Router)         src/app/(marketing)   public landing, legal, /planes
  │                              src/app/(auth)        Magic Link login
  ├─ src/proxy.ts  ─────────►    src/app/(dashboard)   protected CRM, one login per tenant
  │  (edge auth guard)           src/app/api           webhooks, cron, external intake
  ▼
src/lib/data/*        typed, server-only reads — pages never touch Supabase directly
src/lib/services/*    sequence processing, email metrics, AI helpers
  │
  ▼
Supabase Postgres     RLS on every table · triggers score events · pg_cron decays them hourly
  │
  ├─ Storage   property media, per-tenant folders
  └─ Realtime  pipeline + notifications push straight to the browser
```

**Multi-tenancy is structural, not conventional.** Every table carries `tenant_id`; every query is scoped by Postgres Row-Level Security, not just an application-level `WHERE`. One tenant is one login (`agent_owner`) that manages a whole team of `agents` — real people tracked for lead assignment and language routing, most of whom never log in themselves. The full auth model lives in [`CLAUDE.md`](CLAUDE.md#auth-model--owner-login-per-tenant--optional-agent-logins).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| UI | React 19.2 · Tailwind v4 · shadcn/ui · `motion` v12 |
| Language | TypeScript, strict |
| Database | Supabase Postgres — RLS everywhere, 55+ sequential migrations |
| Auth | Supabase Magic Link only — no passwords, ever |
| Email | Resend — sequences, one-offs, inbound replies, delivery webhooks |
| AI | `@anthropic-ai/sdk` — `claude-sonnet-5`, usage metered per tenant |
| Notifications | Telegram bot, fanned out from a single dispatch endpoint |
| Charts | Recharts, client-only |
| Import | PapaParse (CSV) + a patched SheetJS build (XLSX) |
| Hosting | Vercel — preview deploy per PR, hourly crons via cron-job.org |

## Getting started

```bash
git clone <repo-url>
cd itmano-crm
npm install
cp .env.example .env.local   # fill in the keys you need — see table below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The marketing site renders with zero configuration; the dashboard needs Supabase.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Required for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Any Supabase-backed page |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side RLS bypass (data layer, admin routes) |
| `SUPABASE_JWT_SECRET` | The RLS test suite only — mints scoped test tokens |
| `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` | Email sequences, inbound replies, delivery events |
| `UNSUBSCRIBE_SECRET` | Signed unsubscribe links |
| `TELEGRAM_BOT_TOKEN` / `NOTIFICATIONS_WEBHOOK_SECRET` | Telegram notification fan-out |
| `CONTACT_WEBHOOK_SECRET` / `WEBFLOW_WEBHOOK_SECRET` | Acquisition-channel intake endpoints |
| `CRON_SECRET` | Vercel Cron authentication |
| `ANTHROPIC_API_KEY` | AI email drafting, sequence bootstrap, PDF property intake |

Full context and setup links for each key are in [`.env.example`](.env.example).

</details>

## Testing

Each suite is scoped to the layer most likely to break:

```bash
npm run test:rls         # tenant isolation — hits the remote DB, never run in parallel
npm run test:scoring     # scoring triggers and decay
npm run test:auth        # auth flow + the proxy matcher (kept in sync by hand — see below)
npm run test:import      # CSV/XLSX import
npm run test:leads       # lead lifecycle
npm run test:routing     # language-based agent routing
npm run test:visibility  # what an `agent`-role login can and can't see
npm run test:ai-limits   # per-tenant AI budget enforcement
```

Before opening a PR: `npm run build` must succeed and `npm run lint` must be clean. If you touch `src/proxy.ts`'s matcher, update `tests/auth/middleware-matcher.test.ts` in the same commit — it mirrors that literal on purpose.

## Project layout

```
src/
  app/
    (marketing)/     public landing, /planes, legal pages
    (auth)/          Magic Link login
    (dashboard)/     the protected CRM — pipeline, leads, emails, properties, admin…
    api/             webhooks, cron jobs, external intake endpoints
  components/       ui/ (shadcn) · dashboard/ · marketing/ · motion/
  lib/
    types.ts        domain types — the single source of truth
    data/            typed, server-only reads
    services/        email sending, sequence processing, AI helpers
    auth/            tenant context + write guards
  proxy.ts          Next 16's middleware equivalent — the edge auth guard
supabase/migrations/ sequential SQL, RLS policies included inline
tests/                one Vitest suite per concern
```

## Deployment

Every PR gets a Vercel preview deploy. Merges to `main` ship to production at `app.itmano.com`. Scheduled jobs (score decay, sequence orchestration) are triggered hourly by cron-job.org hitting `src/app/api/cron/*`, guarded by `CRON_SECRET`.

## Status

Phases 1–3 are shipped and live: the static UI, the full Supabase/RLS/scoring backend, and Resend/AI/properties end-to-end. The active phase is **comercialización** — turning this from an internal tool into a subscription product: the public landing and legal pages are live, and trial/subscription plumbing (`subscriptions`, `trial_ends_at`, the AI budget gate) is in progress ahead of full billing. The complete phase history and forward roadmap live in [`CLAUDE.md`](CLAUDE.md#estado-del-proyecto--phases-13-completadas).

## Documentation

This README is the front door. For the operating contract — architecture decisions, the full scoring model, the auth model's *why*, hard rules, and the file-by-file map of what to read before touching what — see [`CLAUDE.md`](CLAUDE.md). Next.js-specific breaking changes for this version are tracked in [`AGENTS.md`](AGENTS.md).

---

<p align="center"><sub>Proprietary — © ITMANO. Not open source.</sub></p>
