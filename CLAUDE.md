# CLAUDE.md

This file is the operating contract between Claude Code and the ITMANO CRM repository.
Read it at the start of every session. When in doubt, this file overrides assumptions from training data.

@AGENTS.md

---

## TL;DR — Quick Reference

| Field | Value |
|---|---|
| **Product** | Multi-tenant SaaS CRM for real estate teams, owned by ITMANO |
| **Primary domain** | `app.itmano.com` · subdomain of `itmano.com` (Dylan owns the apex) |
| **Pilot tenant** | A&J Real Estate Group (Hampton Roads, VA) |
| **Active phase** | **Phase 2 — Supabase backend + Auth** (Phase 1 mockup is shipped) |
| **Stack** | Next.js 16.2.4 · React 19.2.4 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (planned) |
| **Package manager** | `npm` |
| **Path alias** | `@/*` → `./src/*` |
| **Tenant per user** | 1 auth user per tenant (see "Auth Model") |
| **Hosting** | Vercel |
| **Default repo branch** | `main` — never commit directly, always PR |

**Single highest-leverage rule:** before touching routing, layouts, server actions, or anything that smells like a Next.js convention, check `node_modules/next/dist/docs/` for the Next.js 16 behavior. Most training data is wrong for this version.

---

## How Claude Code Should Operate Here

These are working principles for *every* session, not preferences.

1. **Explore → Plan → Code → Verify.** For any change that touches more than one file, enter plan mode first. List the files that will change and why. Get confirmation. Then code.
2. **Read before writing.** Before adding a component, read an existing similar one to match conventions (e.g. before building a new chart, read `analytics/charts/*.tsx`). Before changing data shape, read `src/lib/types.ts` and `src/lib/mockdata.ts`.
3. **Reference files, don't reinvent.** This document points to where the truth lives. Don't reimplement `STATUS_CONFIG`, `LANGUAGE_CONFIG`, `MOCK_AGENTS`, design tokens, or types — import them.
4. **Verify your own work.** After any change: run `npm run lint`. After UI changes: describe what to look at and what should be visible. After data-layer changes: confirm types still compile (`npx tsc --noEmit`).
5. **Address root causes, not symptoms.** If a build fails, never suppress the error. If a type is wrong, fix the type, not the cast.
6. **Stay inside scope.** Don't refactor unrelated code, rename files, or "improve" patterns the user didn't ask about. If you notice something worth fixing, mention it and ask — don't act.
7. **When uncertain, stop and ask.** A 30-second clarification beats a 30-minute rewrite. Specifically: ask before changing the data model, the auth model, the route group structure, or the design system.
8. **No code in this file is ever copied verbatim.** Snippets here are illustrative. The source of truth is always the file referenced.

---

## Active Phase — Phase 2: Supabase Backend + Auth

**Status:** Just started. Phase 1 (static UI mockup) is shipped and live at `https://app.itmano.com/dashboard`.

### What Phase 2 must deliver

1. **Cleanup of the legacy `(funnel)` experiment.** Phase 1 included a sample lead-magnet landing page at `src/app/(funnel)/lm/guia-familias-hispanas/`. That experiment is over — this app does not host funnels. Delete the entire `(funnel)/` route group, remove `framer-motion` from `package.json`, drop the funnel components directory if it exists, and remove orphan assets from `/public/` (`adriana_face.JPG`, `mockup.png`, `family_home.png`). Do this **first**, before installing Supabase, so the repo is clean.
2. **Supabase project** wired up (`@supabase/supabase-js` + `@supabase/ssr` for Next.js App Router).
3. **Schema** mirroring `src/lib/types.ts` with `tenant_id` on every row, *plus* the new scoring tables (`lead_events`, `lead_score_rules`, `lead_status_history`, `notifications`) described in the "Lead Scoring Model" section.
4. **Row Level Security (RLS)** policies enforcing tenant isolation. RLS is the source of truth for security — never trust code-level filtering alone.
5. **Auth** via Supabase Auth using **Magic Link only** (`signInWithOtp`). No password flow. The login page at `(auth)/login` becomes a real authenticator: user enters email → receives one-time link → lands authenticated. Roles: `super_admin` (ITMANO internal) and `agent_owner` (the tenant's single login).
6. **Tenant seed** for A&J Real Estate Group with the 4 team-member agents preserved (only `agent-adriana` has `user_id` populated). See "Auth Model" for credentials.
7. **HubSpot migration of the 114 real contacts** as `status = 'cerrado'` with `current_score = NULL` and `peak_score = NULL` — they are post-funnel newsletter recipients, not scored leads. They can re-enter the funnel if a new engagement event arrives (then scoring begins from that moment).
8. **Migration of the 75 Phase-1 mock leads** if useful for QA continuity, otherwise drop them.
9. **Real-data wiring** of the existing pages: dashboard, leads list, lead detail, lead creation, analytics, lead magnets, settings. Replace direct mockdata imports with server-side Supabase reads.
10. **Scoring triggers** in Postgres on `lead_events` (event insert → score update → status auto-promotion → notification fire). See "Lead Scoring Model — Database Architecture".
11. **Decay cron** scheduled hourly via `pg_cron` or Supabase Edge Function. Recalculates `current_score` for inactive leads, demotes status bands.
12. **`.env.local`** populated; `.env.example` updated with all new vars. Never commit secrets.

### What Phase 2 must NOT do (yet)

- No Resend integration (Phase 3). The scoring system has hooks for email events but those webhook endpoints are scaffolded only — they do nothing until Phase 3.
- No WhatsApp Business Cloud API (Phase 4).
- No velocity multiplier or advanced analytics (Phase 5).
- No ManyChat webhook receiver (Phase 3).
- No new pages or features that weren't in the Phase 1 mockup. Phase 2 is *backend underneath the existing UI*, not new UX.

### Order of operations for Phase 2

Work in this sequence. Each step must end in a green build and a working dev server before moving on.

0. **Funnel cleanup** (see deliverable 1). PR titled `chore/funnel-cleanup`. Verify `npm run build` is green afterwards.
1. Supabase project setup + env vars + client helpers (`src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`).
2. Schema migration files in `supabase/migrations/`. One file per logical unit (`tenants`, `agents`, `lead_sources`, `lead_magnets`, `leads`, `lead_events`, `lead_score_rules`, `lead_status_history`, `notifications`, `purchase_processes`).
3. RLS policies in a dedicated migration file. Pattern: every table policy joins through `agents.user_id = auth.uid()` to derive `tenant_id`. `super_admin` role bypasses via a separate permissive policy.
4. Scoring rules seed: global `lead_score_rules` populated with the source baselines and event weights defined in "Lead Scoring Model". Scoring triggers installed on `lead_events`. Hourly decay cron registered (`pg_cron` or Edge Function).
5. Seed file for A&J tenant + 4 agents (only `agent-adriana` has `user_id`) + lead sources.
6. Auth: middleware (`src/middleware.ts`) protecting `(dashboard)` routes; login form wired to `supabase.auth.signInWithOtp` (Magic Link); callback route handles the OTP redirect; `super_admin` users go to `/admin`, `agent_owner` users go to `/dashboard`.
7. HubSpot CSV migration script for the 114 closed contacts (insert as `status = 'cerrado'`, `current_score = NULL`, `peak_score = NULL`).
8. Data access layer (`src/lib/data/*.ts`) — one file per entity, server-only, replaces mockdata imports page by page.
9. CSV/XLSX import in `leads/new` now writes to Supabase inside a single transaction; new leads receive a source baseline score automatically.
10. Realtime: subscribe the dashboard pipeline to `leads` table changes and the topbar notification bell to `notifications` table changes. Mobile-friendly, no flicker.

---

## Business Context (the "why")

This is not a generic CRM. Without this context, Claude Code will make wrong product decisions.

**ITMANO** is a premium Growth Partner company for real estate. It doesn't sell ads or marketing as services — it sells *infrastructure*: acquisition → qualification → nurturing → conversion, all wired together, and a **branded CRM dashboard** that lives at `app.itmano.com/<tenant>` so the client can see their pipeline in real time.

**The dashboard is the differentiator.** Most agencies hand the client a PDF report once a month. ITMANO hands the client a live dashboard with their leads, their pipeline, their agents, their conversion. That's why the dashboard cannot look or feel like a stock SaaS template — it must feel *premium, considered, real-estate-native*.

**Pilot tenant — A&J Real Estate Group:** Adriana Melendez leads a team in Hampton Roads, Virginia. Four agents on the team, four languages/specialties (Spanish-hispanic, English-military, Spanish/English first-buyer, Portuguese-Brazilian). The team has 114 real contacts migrated from HubSpot, real lead magnets in production, real email sequences in flight.

**Second tenant in negotiation — Hector Sanz (TECNOCASA, El Prat de Llobregat, Barcelona).** The A&J Real Estate dashboard *is* his demo. Anything that breaks A&J's polish breaks the sales pitch to Hector.

**Brand voice for any client-facing copy generated in this app:**
- Always **Spanish neutro latino** for dashboard UI, emails, lead magnet landing pages — no regional idioms.
- Money words: always `"inversión"`. Never `"costo"`, `"precio"`, `"pago"`, `"cargo"`.
- Tone: premium, strategic, calm. Never hype, never emojis in product copy, never marketing-speak.

---

## Architecture Principles

### Multi-tenancy is non-negotiable

- Every database table has `tenant_id uuid not null`. No exceptions, even for tables that "feel global" — make them global by setting `tenant_id` nullable *only* with explicit justification (e.g. `email_templates` may have global ITMANO defaults).
- Every query is scoped by tenant via RLS. Code-level `where tenant_id = ?` is a belt; RLS is the suspenders. Both stay.
- Never hardcode `aj-real-estate` or any A&J value in shared code. If a value is A&J-specific, it's seed data, not code.
- Branding (logo, primary color, name) lives on the `tenants` row and is read into the layout. Don't hardcode any tenant-specific colors into shared components.

### Auth Model — One user per tenant (today)

**The decision:** each tenant has exactly **one** Supabase Auth user. That user has the `agent_owner` role and full access to their tenant's data.

**Why this matters for the schema:** the `agents` table represents **team members** of the real estate firm, *not* login users. A&J has four agents (Adriana, John, Melanie, Viviane) tracked for lead assignment, language routing, accent colors, and per-agent metrics — but only one of them logs in. Concretely:

- `agents.user_id` is **nullable**. Most rows have `null`. The one agent record that maps to the login user has `user_id = auth.users.id`.
- Lead assignment, lead-magnet ownership, secuencia-de-emails ownership, and analytics are all keyed by `agents.id`, never by `auth.users.id`.
- The login user manages all leads of all agents in their tenant. The CRM is a single-operator tool, even though it tracks a team.

**Why we built it this way:** it preserves ITMANO's differentiator (team-level CRM that gestiona equipos) and keeps the door open to add more login users per tenant later (e.g. give Melanie her own login) without redesigning the data model. Just flip a row's `user_id` from `null` to a real auth user.

**Implication for `super_admin`:** the ITMANO-internal role bypasses tenant filtering via a separate RLS policy that grants access to all tenants. `super_admin` is for Dylan and future ITMANO operators only — never given to clients. **Dylan's super_admin login: `dj.vergara@hotmail.com`** (Magic Link, same method as tenant users).

**Auth method:** Magic Link only (`signInWithOtp`). No passwords are ever set, stored, or reset. The user enters their email, receives a one-time link, and lands authenticated. Reasons: zero passwords to manage, zero password-reuse attack surface, simpler UX for non-technical real estate agents, works on any device with email access, no OAuth provider dependency.

**Current state of the repo:** the Phase 1 mockup created 4 demo logins. These will be consolidated to 1 during Phase 2 seeding. For A&J Real Estate, the single login is `agent-adriana` authenticated via Magic Link sent to **`adrysofirealestate@gmail.com`** (Adriana's personal Gmail). The other three agents remain as team members with `agents.user_id = NULL`.

### Data flows in one direction

- **Server Components fetch.** Client Components receive props.
- Data fetching lives in `src/lib/data/*.ts` — pure server functions returning typed objects. Pages call these, not Supabase directly, so we can swap implementations without touching pages.
- Mutations go through **Server Actions** (preferred) or route handlers under `src/app/api/*` (only when an external system calls in, e.g. a Webflow form post, a Meta webhook).
- No client-side Supabase queries for application data. Client-side Supabase is allowed only for: auth state, realtime subscriptions.

---

## Lead Scoring Model

The scoring system is the operating heart of the CRM. It determines lead status, drives agent attention, and triggers notifications. Without it, leads pile up undifferentiated and the agent guesses. With it, automation does the prioritization.

### Principle

Score is a 0–100 integer derived from **two inputs**: the source the lead came from (baseline) and the behavioral events the lead has triggered since arrival (deltas), modulated by time-decay when there is no recent engagement. The score determines the lead's status band automatically. Agent intervention is only required for the manual status transitions at the end of the funnel (`en_proceso` → `proceso_completado` → `cerrado`/`perdido`).

**Two rules that override everything:**
- **Open events do not count.** Apple Mail Privacy Protection inflates email open rates by 15–35% by pre-fetching tracking pixels. Roughly half of real-estate buyer emails are read in Apple Mail. Email opens are logged for analytics but contribute negligible score (+2). Clicks, replies, downloads, and form submissions are the real signals.
- **Score is frozen** once a lead enters `en_proceso`, `proceso_completado`, `cerrado`, or `perdido`. These are agent-driven statuses and post-funnel. A frozen lead can re-enter the funnel if a new engagement event arrives (e.g. a closed lead clicks the newsletter); scoring resumes from that event.

### Source baseline scores

Set on lead creation, based on `lead_sources.source_type`:

| Source | Baseline | Notes |
|---|---|---|
| Manual lead — closed pre-existing customer (newsletter only) | `NULL` (`status = cerrado`) | Post-funnel. No scoring. |
| Manual lead — in active closing process | `NULL` (`status = en_proceso`) | Post-funnel. No scoring. |
| Event (in-person interaction with agent) | 40 | Physical contact = high intrinsic intent. |
| Web contact form — with specific question | 35 | Asked something concrete. |
| Web contact form — email only, no question | 20 | Curiosity confirmed, weak intent. |
| ManyChat — reel CTA response | 20 | Engaged with content + DM is deliberate. |
| Lead magnet — landing page form filled | 15 | Standard top-of-funnel signal. |

### Event weights

**Nuclear signals** (deliberate, hard to fake):

| Event | Points |
|---|---|
| Consultation / showing scheduled | +50 (also auto-promote to `caliente`) |
| Consultation / showing attended (not no-show) | +30 additional |
| AVM / property valuation request | +40 |
| Specific property inquiry | +30 |
| Reply to email or WhatsApp | +30 |
| Phone call answered, > 2 min | +25 |

**Medium signals** (deliberate engagement):

| Event | Points |
|---|---|
| Click on CTA in email | +15 |
| 2nd lead magnet downloaded | +20 |
| 3rd+ lead magnet downloaded | +25 |
| Visit to services / pricing page | +15 |
| Newsletter subscription (separate from form fill) | +10 |

**Low signals** (logged but mostly ignored for scoring):

| Event | Points |
|---|---|
| Email opened | +2 |
| Generic page visit | +3 |

**Negative signals** (terminal or near-terminal):

| Event | Points | Side effect |
|---|---|---|
| Unsubscribed from email | −50 | Block email channel for this lead |
| Hard bounce | −30 | Mark email as invalid |
| Spam complaint | −100 | Block all comms, force `status = perdido` |
| Reply with "stop" / "no" / "no me escribas" | −40 | Pause automated sequences |

### Time decay (continuous, not stepwise)

Decay only applies after 14 days of no engagement, and halves the score every 30 days thereafter:

```
if days_since_last_event ≤ 14:    current_score = peak_score
else:                              current_score = peak_score × 0.5 ^ ((days - 14) / 30)
```

A lead at peak 80 reads as 80 at day 14, 40 at day 44, 20 at day 74, 10 at day 104. A new event resets the timer and updates `peak_score`.

### Status bands (automatic)

| Score range | Status |
|---|---|
| 0–14 | `nuevo` |
| 15–34 | `nurturing` |
| 35–59 | `tibio` |
| 60+ | `caliente` |

Promotion is automatic. **Demotion is also automatic** — a `caliente` lead that decays below 35 demotes to `tibio`, then `nurturing`, etc.

**Post-funnel statuses are agent-driven and freeze the score:** `en_proceso`, `proceso_completado`, `cerrado`, `perdido`.

### Notifications (separate from status)

Adriana receives an immediate notification (in-app bell + email backup) when:
- Any lead crosses `current_score ≥ 80` (rising edge — fires once when transitioning from <80 to ≥80, not repeatedly).
- Any new lead is created from the "contáctanos" web form, regardless of score.

In Phase 4, these same triggers also push to WhatsApp. The notification logic lives in a single place — the scoring trigger — and fans out to channels.

### Event deduplication

To prevent score inflation from forwards, refreshes, and webhook retries:
- Email open events: same `lead_id` + same email message dedup'd within a 30-minute window.
- Email click events: same `lead_id` + same destination URL dedup'd within 1 hour.
- Page visits: same `lead_id` + same page URL dedup'd within 1 hour.
- All other events: rely on `dedup_key` provided by the source (e.g. webhook event ID).

The `lead_events` table has a uniqueness constraint on `(lead_id, dedup_key)` to enforce this at the database level.

### Score caps

`current_score` and `peak_score` are both bounded `0 ≤ score ≤ 100`. Increments that would exceed 100 are clamped. Decrements that would go below 0 are clamped.

### Where the rules live

The values in this section are **defaults seeded into `lead_score_rules` table** during Phase 2 setup. The table is global today (one set of rules for all tenants). Per-tenant overrides are out of scope until a paying tenant requests it (YAGNI). Schema sketch:

```
lead_score_rules:
  event_type TEXT PRIMARY KEY     -- 'email_clicked', 'consultation_scheduled', ...
  points INT NOT NULL
  dedup_window_minutes INT
  freeze_on_status TEXT[]          -- statuses where this event is ignored
  side_effect TEXT                 -- 'block_email', 'block_all', 'force_status_perdido', NULL
```

Changing a weight is an `UPDATE` to one row, not a code change. Future per-tenant overrides will add a nullable `tenant_id` column with the global rules as fallback.

### Database architecture for scoring

The scoring system uses **stored scores updated by Postgres triggers, with a periodic decay cron**. Chosen over alternatives (compute-on-read function, materialized view, external CDP) for the right balance of accuracy, performance, and operational simplicity at our scale.

**Tables involved:**

| Table | Role |
|---|---|
| `leads` | Carries `peak_score INT`, `current_score INT`, `last_event_at TIMESTAMPTZ`, `score_updated_at TIMESTAMPTZ`. `current_score` is what the UI reads. |
| `lead_events` | Append-only event log. Each row: `event_type`, `points`, `occurred_at`, `dedup_key`, `metadata JSONB`. Never updated, never deleted. |
| `lead_score_rules` | The weights table (see above). |
| `lead_status_history` | Audit trail: every status transition recorded with `from_status`, `to_status`, `triggered_by` (`auto_promotion` / `auto_demotion` / `agent_action`), `at`. |
| `notifications` | Per-tenant inbox for Adriana / super_admin. Surfaces in the topbar bell. |

**Trigger flow on event insert** (`AFTER INSERT ON lead_events`):

1. Validate dedup (a `BEFORE INSERT` trigger rejects duplicates by `dedup_key`).
2. `UPDATE leads SET peak_score = LEAST(100, peak_score + points), current_score = LEAST(100, current_score + points), last_event_at = NOW()`.
3. Apply side effects from the matched rule (block email channel, force `perdido`, etc.).
4. Re-evaluate status band; if changed, `UPDATE leads.status` + `INSERT lead_status_history`.
5. If `current_score` crossed ≥80 on this update (rising edge), `INSERT notifications`. If event was `contact_form_question`, `INSERT notifications` unconditionally.

**Decay cron** (hourly, via `pg_cron` or Supabase scheduled Edge Function):

1. For each lead where `last_event_at < NOW() - INTERVAL '14 days'` AND `status IN ('nuevo','nurturing','tibio','caliente')` AND `score_updated_at < NOW() - INTERVAL '1 hour'`:
2. Compute `new_score = ROUND(peak_score × 0.5 ^ ((days_since_last_event - 14) / 30))`.
3. `UPDATE leads SET current_score = new_score, score_updated_at = NOW()`.
4. Re-evaluate status band; demote if needed (writes to `lead_status_history`).

**Reads:** the UI reads `current_score` from `leads` directly — no joins, no aggregates. Sortable, filterable, indexable. The dashboard's pipeline view orders leads within each status column by `current_score DESC`.

**Realtime:** Supabase Realtime broadcasts row changes on `leads` and `notifications`. The dashboard pipeline and the notification bell subscribe and update live, no manual refresh.

### Operational hygiene

- `lead_events` grows append-only. Plan for retention: archive events older than 24 months to a cold table once volume justifies (post-Phase 5 problem).
- The decay cron must be idempotent. Two runs of the same hour should produce the same result.
- Score recalculation on demand (`recalc_lead_score(lead_id)`) must exist as a Postgres function for debugging and manual fixes. Never let the only path to a correct score be "wait for the cron."
- Every `UPDATE` to `leads.status` writes to `lead_status_history`. No silent transitions.

---

## Tech Stack Reality

| Area | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.2.4 (App Router) | Breaking changes from training data — see `@AGENTS.md` |
| React | 19.2.4 | Server Components default; use `useTransition` for action UX |
| Language | TypeScript (strict) | No `any` without a `// reason:` comment |
| Styling | Tailwind v4 + CSS variables | `@theme inline` block in `globals.css` maps CSS vars to Tailwind utility names |
| UI primitives | shadcn/ui via `components.json` | When you need a new primitive, prefer `npx shadcn@latest add <name>` over rolling one |
| Forms | Native + Server Actions | No `react-hook-form` unless explicitly requested |
| Charts | `recharts` | Client-only; never import in a Server Component |
| Animations | None by default | The CRM is deliberately static and calm. Don't add animation libraries without a request. |
| Tables | Hand-rolled today (Phase 1) | If we need sorting/virtualization, evaluate `@tanstack/table` before reinventing |
| Auth | Supabase Auth (Phase 2) | Use `@supabase/ssr` cookies, not localStorage |
| Database | Supabase Postgres (Phase 2) | RLS mandatory on every table |
| Realtime | Supabase Realtime (Phase 2, dashboard only) | WebSockets via the JS client |
| CSV/XLSX | `papaparse` + `xlsx` | Already wired in `leads/new`; max 500 rows |
| Email | Resend + React Email (Phase 3) | Not yet |
| WhatsApp | Meta Cloud API direct (Phase 4) | Not yet |
| Hosting | Vercel | Preview deploys on every PR |
| **Forbidden** | AOS, jQuery, any DOM-mutating animation library | They break SSR. The CRM doesn't need animations. |

---

## Commands

```
npm run dev      # Dev server
npm run build    # Production build (run this before opening a PR)
npm run lint     # ESLint
npx tsc --noEmit # Type check without emit — run after any types/* change
```

No test suite exists. Don't fabricate one without a request from the user. If tests are needed for a tricky function, write a single focused file and ask whether to wire up Vitest properly.

---

## Repository Structure

```
src/
  app/
    (auth)/login/             — public, dark theme
    (dashboard)/              — protected (Phase 2), CRM dark theme
      dashboard/              — pipeline + KPI cards
      leads/                  — list, filters, detail, new
      analytics/              — Server pages + client chart wrappers
      lead-magnets/           — CRUD per agent (tracking only — landing pages live outside this app)
      settings/
    api/                      — route handlers for external callers (webhooks, forms)
  components/
    ui/                       — shadcn primitives
    dashboard/                — CRM-specific composites
  lib/
    types.ts                  — domain types (single source of truth)
    mockdata.ts               — Phase 1 only; deprecated as data sources move to Supabase
    supabase/                 — Phase 2: server.ts, client.ts, middleware helpers
    data/                     — Phase 2: typed data-access functions per entity
    utils.ts
  middleware.ts               — Phase 2: route protection
supabase/
  migrations/                 — Phase 2: SQL migrations, sequentially numbered
  seed.sql                    — Phase 2: A&J tenant + agents + 75 leads
public/                       — static assets
```

---

## Route Groups & Layouts

| Group | Path prefix | Theme | Auth |
|---|---|---|---|
| `(auth)` | `/login` | Dark | Public |
| `(dashboard)` | `/dashboard`, `/leads`, `/analytics`, `/lead-magnets`, `/settings` | Dark premium (CSS vars) | Protected (Phase 2) |

The `(dashboard)` layout wraps content in a fixed 220px `Sidebar` + `Topbar` + main area. This is the only design system in the app.

---

## Domain Types — Source of Truth: `src/lib/types.ts`

```
LeadStatus:       new → nurturing → warm → hot → process_started → process_completed → closed | lost
AgentSpecialty:   hispanic | military | first_buyer | brazilian
LeadSourceType:   lead_magnet | web_form | open_house | manual | ads | referral
Language:         es | en | pt
```

Read the file before adding any field. When extending it, also extend `STATUS_CONFIG`, `LANGUAGE_CONFIG`, or `SOURCE_CONFIG` in `mockdata.ts` to keep labels/colors consistent.

---

## Design System — CRM (dark)

All components must use CSS variables. **Never hardcode hex colors.**

Tokens are defined in `src/app/globals.css` under `:root` and mapped to Tailwind via `@theme inline`. Available tokens cover backgrounds (`--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-overlay`), text (`--text-primary`, `--text-secondary`, `--text-muted`), accents (`--accent-gold`, `--accent-gold-dim`, `--accent-blue`, `--accent-teal`, `--accent-coral`, `--accent-pink`, `--accent-green`), borders, and per-status colors. Read `globals.css` before adding a new token — extend, don't duplicate.

- Typography: Inter (300/400/500/600). Base size 14px.
- Radii: cards 12px, inputs/buttons 8px, badges 4–6px, avatars 50%.

---

## Component Patterns

### Server vs Client — default Server

Add `'use client'` only when the component uses:
- React hooks (`useState`, `useEffect`, `useRef`, etc.)
- `recharts`
- `useRouter`, `useParams`, `useSearchParams`

**Never import `recharts` in a Server Component.** Use the existing pattern: server page computes data → passes typed props to a `'use client'` chart wrapper under `analytics/charts/`.

### Tabs / interactive islands in Server pages

Extract only the interactive state into a minimal `'use client'` component. Pass the pre-rendered Server content as props or children. See `lead-magnets/lm-tabs.tsx` for the canonical pattern.

### Hover interactions

CSS class + inline `<style>` tag at the top of the component. Pattern used throughout the codebase. Don't reach for `:hover` arbitrary-value Tailwind utilities when the existing pattern works.

### Forms & Server Actions

- Define the action in the same file as the component (`'use server'` inline) for simple forms.
- For reusable mutations, put them in `src/lib/data/<entity>.ts` and import.
- Always validate input with a schema (`zod`) before hitting the database.
- Always return typed `{ ok: true, data }` or `{ ok: false, error }` shapes from actions, never throw to the client.

---

## Tenant Data — A&J Real Estate Group

| Agent ID | Name | Specialty | Language | Accent color | Role |
|---|---|---|---|---|---|
| `agent-adriana` | Adriana Melendez | hispanic | es | `#5B8EC9` (blue) | **Login user** for the tenant — email: `adrysofirealestate@gmail.com` |
| `agent-john` | John Leonard | military | en | `#5AAFA0` (teal) | Team member, no login |
| `agent-melanie` | Melanie Valencia | first_buyer | es | `#C97B6B` (coral) | Team member, no login |
| `agent-viviane` | Viviane Chiu | brazilian | pt | `#B87BA3` (pink) | Team member, no login |

Agent accent color is used for avatar backgrounds at 15% opacity (`${color}26`).

**Language auto-routing for new leads** (preserved from Phase 1): `es → agent-adriana`, `en → agent-john`, `pt → agent-viviane`. Melanie is a manual-assignment specialty.

**Historical contacts:** the 114 real contacts migrated from A&J's HubSpot enter the system as `status = 'cerrado'` with `current_score = NULL` and `peak_score = NULL`. They are newsletter recipients, not active leads in the scoring funnel. If one of them generates a new engagement event (clicks the newsletter, fills a form, replies), the scoring system reactivates them: the event sets a new `peak_score`, and they re-enter the funnel at the appropriate status band.

---

## CSV/XLSX Import (`leads/new`)

Already implemented in Phase 1. Phase 2 must preserve the contract:

- Columns: `firstName`, `lastName`, `email`, `phone`, `language`, `agentId`, `sourceType`, `lender`, `notes`.
- Max 500 rows.
- Comment lines starting with `#` are skipped in CSV.
- `papaparse` for CSV, `xlsx` for XLSX.
- In Phase 2, the import writes to the `leads` table inside a single transaction, with `tenant_id` derived from the authenticated user. Partial failures roll back.

---

## Hard Rules — Never Cross These

1. **Never commit directly to `main`.** Always a feature branch + PR. Branch naming: `phase2/<short-slug>`, `fix/<short-slug>`, `chore/<short-slug>`.
2. **Never commit secrets.** No keys in code, no keys in `.env.example`. `.env.example` lists variable *names* only.
3. **Never bypass RLS.** No `service_role` key in the browser. No code that fetches data without going through an authenticated Supabase client (server-side) or a server-side data function.
4. **Never hardcode tenant data.** A&J's name, color, logo, slug, agents — all come from the database.
5. **Never use AOS, jQuery, or any DOM-mutating library.** They break SSR.
6. **Never run destructive operations without a plan.** `DROP TABLE`, `TRUNCATE`, `rm -rf`, mass deletes — describe what will happen first, get confirmation, then act.
7. **Never copy a snippet from this CLAUDE.md as if it were code.** The file referenced is the source of truth.
8. **Never expose internal IDs in URLs that don't need them.** Use slugs where the user-facing route benefits (e.g. `/lm/guia-familias-hispanas`); use IDs where uniqueness matters (e.g. `/leads/<uuid>`).
9. **Never start a Phase 3+ feature** (email, WhatsApp, scoring) during Phase 2 unless explicitly asked.

---

## Git & Commit Conventions

- **Conventional Commits.** `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `perf:`, `test:`.
- Commit messages are imperative, present tense, lowercase first word after the type. Subject line ≤ 72 chars.
- A commit corresponds to one logical change. Don't bundle a refactor with a feature.
- PR descriptions list: what changed, why, what to verify manually.
- Before opening a PR: `npm run build` must succeed, `npm run lint` must be clean.

---

## Brand Voice for User-Facing Copy

When generating any string that the client will see — page copy, form labels, email bodies, empty states, error messages — apply these rules:

- **Language:** Spanish neutro latino. No regional idioms. No "vosotros". No "tío".
- **Money words:** always `"inversión"`. Never `"costo"`, `"precio"`, `"pago"`, `"cargo"`.
- **Tone:** premium, strategic, calm. Specific over generic. Numbers when possible. No marketing fluff. No emojis in product surfaces.
- **Per-tenant tone overrides:** Some tenants may need a Spain-Spanish dialect (e.g. TECNOCASA Barcelona will use `vosotros`). Tenant-specific tone is configured on the `tenants` row, not in shared code.
- **Empty states are not jokes.** "No hay leads todavía" is fine. "¡Vacío! 😅" is not.

---

## Files To Read Before Acting

Read these *before* writing code that touches their domain:

| If you're working on… | Read first |
|---|---|
| Anything that uses leads, agents, sources, lead magnets | `src/lib/types.ts`, `src/lib/mockdata.ts` |
| Anything that touches scoring, status auto-transitions, or notifications | The "Lead Scoring Model" section above, then the scoring migration files in `supabase/migrations/` |
| Anything in `(dashboard)` | `src/app/globals.css` (design tokens), the closest existing page |
| A new chart | An existing chart under `analytics/charts/` |
| Auth or middleware | Supabase SSR docs at https://supabase.com/docs/guides/auth/server-side/nextjs |
| Migrations or RLS | The most recent migration file in `supabase/migrations/` |
| Routing, layouts, or server actions | The Next.js 16 guide in `node_modules/next/dist/docs/` |

---

## Roadmap (informational — do not start without explicit instruction)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Static UI mockup with `mockdata.ts` (75 leads, 4 agents, all CRM pages) | ✅ Shipped |
| **Phase 2** | Funnel cleanup; Supabase Auth (Magic Link) + DB + RLS + Realtime; scoring tables + triggers + hourly decay cron; A&J seed (1 login per tenant); HubSpot 114-contact migration as `cerrado`/no-score | 🚧 **Active** |
| Phase 3 | Resend + React Email; webhook receivers fire scoring events; per-agent sequences; ManyChat webhook receiver replaces manual import | ⏳ |
| Phase 4 | Meta WhatsApp Cloud API; same triggers as email; notifications to Adriana fan out to WhatsApp | ⏳ |
| Phase 5 | Velocity multiplier; quarterly reactivation campaigns; lead-magnet CRUD UI; per-tenant scoring rule overrides if any tenant requests them; analytics deep-dive | ⏳ |

---

## Glossary

| Term | Definition |
|---|---|
| **Tenant** | One ITMANO client (e.g. A&J Real Estate Group). Owns a `tenants` row, has 1 login user, has many agents/leads/lead_magnets. |
| **Agent** | A team member of a tenant. May or may not have login access. Tracked for lead assignment, language routing, per-agent metrics, accent color. |
| **Lead** | A prospective home buyer or seller. Lives under one tenant, assigned to one agent, has a status in the pipeline flow, a source, a `peak_score`, a `current_score`, and a history of events. |
| **Lead magnet** | A free downloadable resource (guide, checklist) produced by an agent to capture leads. The CRM tracks downloads, per-agent ownership, and conversions. Landing pages live outside this app (on the client's website). |
| **Pipeline** | The visual representation of leads grouped by status: `nuevo` → `nurturing` → `tibio` → `caliente` → `en_proceso` → `proceso_completado` → `cerrado` \| `perdido`. The first four bands are score-driven and automatic; the last four are agent-driven and freeze the score. |
| **Peak score** | The highest score the lead has reached since its last engagement event. Set by `lead_events` deltas. Capped 0–100. |
| **Current score** | What the UI shows. Equal to `peak_score` for 14 days after the last event, then decays via the half-life formula. The status band is derived from this value. |
| **Lead event** | Any tracked action by or about a lead: form submitted, email clicked, consultation scheduled, replied, unsubscribed, etc. Append-only in `lead_events`. Each event has a `dedup_key` to prevent inflation from forwards/retries. |
| **Source** | Where a lead came from: `event`, `contact_form_question`, `contact_form_basic`, `manychat`, `lead_magnet`, `manual_active`, `manual_closed`. Determines the baseline score on lead creation. |
| **Status band** | One of the four score-driven statuses (`nuevo`, `nurturing`, `tibio`, `caliente`). Transitions happen automatically when `current_score` crosses a boundary. |
| **Frozen score** | When a lead enters `en_proceso`, `proceso_completado`, `cerrado`, or `perdido`, scoring stops. A new engagement event can unfreeze and reactivate. |
| **Notification** | An in-app alert (and email backup) sent to the tenant's login user. Fires on score ≥80 rising edge, or on any new `contact_form_question` event. |
| **Purchase process** | An active home-buying engagement started when a lead moves to `en_proceso`. Tracks property address, loan type, estimated close date. |
| **CRM** | The internal dashboard the tenant logs in to use. |
| **Super admin** | ITMANO-internal role. Bypasses tenant filtering. Used by Dylan only. Email: `dj.vergara@hotmail.com`. |
| **Agent owner** | The tenant's single login user. Sees only their tenant's data. |

---