# CLAUDE.md

This file is the operating contract between Claude Code and the ITMANO CRM repository.
Read it at the start of every session. When in doubt, this file overrides assumptions from training data.

@AGENTS.md

---

## TL;DR — Quick Reference

| Field | Value |
|---|---|
| **Product** | Multi-tenant SaaS CRM for real estate teams, owned by ITMANO — see "El Producto" below |
| **Primary domain** | `app.itmano.com` · subdomain of `itmano.com` (Dylan owns the apex) |
| **Pilot tenant** | A&J Real Estate Group (Hampton Roads, VA) |
| **Active phase** | **Comercialización** — public landing + legal pages, then billing (Phases 1–3 shipped) |
| **Stack** | Next.js 16.2 · React 19.2 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (live) · Resend (live) · Anthropic SDK (live) · motion v12 |
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
2. **Read before writing.** Before adding a component, read an existing similar one to match conventions (e.g. before building a new chart, read `analytics/charts/*.tsx`). Before changing data shape, read `src/lib/types.ts` and the relevant migration in `supabase/migrations/`.
3. **Reference files, don't reinvent.** This document points to where the truth lives. Don't reimplement `STATUS_CONFIG`, `LANGUAGE_CONFIG` (in `src/lib/config.ts`), design tokens, or types — import them.
4. **Verify your own work.** After any change: run `npm run lint`. After UI changes: describe what to look at and what should be visible. After data-layer changes: confirm types still compile (`npx tsc --noEmit`).
5. **Address root causes, not symptoms.** If a build fails, never suppress the error. If a type is wrong, fix the type, not the cast.
6. **Stay inside scope.** Don't refactor unrelated code, rename files, or "improve" patterns the user didn't ask about. If you notice something worth fixing, mention it and ask — don't act.
7. **When uncertain, stop and ask.** A 30-second clarification beats a 30-minute rewrite. Specifically: ask before changing the data model, the auth model, the route group structure, or the design system.
8. **No code in this file is ever copied verbatim.** Snippets here are illustrative. The source of truth is always the file referenced.

---

## El Producto — Qué es ITMANO CRM

ITMANO CRM is a **white-labeled, multi-tenant SaaS CRM for real estate teams**, sold as the visible centerpiece of ITMANO's Growth Partner service. Each client (tenant) gets a live, branded dashboard at `app.itmano.com` instead of a monthly PDF report. It is sold **sales-led by subscription** ("Contáctanos" — no self-serve signup); public plans: Esencial $149/mes · Growth $299/mes · Partner (custom). Payment processing is not integrated yet (see Roadmap — Billing).

**What the CRM includes today:**

- **Automatic lead scoring (0–100)** — source baseline + weighted behavioral events + time-decay; drives pipeline status automatically (see "Lead Scoring Model"). Postgres triggers + hourly decay cron.
- **Pipeline dashboard** — leads grouped by status band, KPI cards, Supabase Realtime updates.
- **Lead management** — list/filters/detail/manual creation, CSV/XLSX import, language auto-routing to agents, form-submission snapshots.
- **Email nurturing (Resend)** — per-agent sequences with AI bootstrap, in-CRM composer with AI drafting and per-agent signatures, purchase-process lifecycle emails, one-off sends, inbound reply capture, unsubscribe/bounce/spam guards. Click rate is the engagement metric (never opens).
- **Properties module** — listings CRUD with media in Supabase Storage; doubles as the data source for the client's public website (anon reads published rows/columns only).
- **Acquisition channels** — lead magnets, event forms, contact forms, Webflow/ManyChat intake endpoints with dedup and scoring.
- **Analytics** — per-agent, per-channel, and email analytics; platform KPIs in the super-admin hub.
- **Notifications** — in-app bell + Telegram dispatch (score ≥80 rising edge, contact-form questions, event submissions, email replies).
- **Admin panel** (`/admin`) — super_admin hub: platform KPIs, tenant cards, tenant management, "act as tenant" switcher.
- **Auth** — Supabase Magic Link only, closed signups; roles `super_admin` / `agent_owner` / `agent` (see "Auth Model").

**AI integrations (Anthropic SDK, `claude-sonnet-5`):**

- **Email drafting** — the composer writes/rewrites personal-letter-style emails per agent voice.
- **Sequence bootstrap** — generates a 3-step sequence for an empty sequence in one click.
- **Property intake from PDF** ("Crear con IA") — extracts a listing PDF into a prefilled form for human review (gated behind `AI_ENABLED` in `properties-client.tsx`).
- **Per-tenant AI usage tracking** — `ai_usage_events` (migration 052) records tokens/cost per call; dashboards for the super admin. AI cost is paid by ITMANO, so watch this before pricing changes.

---

## Estado del proyecto — Phases 1–3 completadas

**Live at `https://app.itmano.com`.** The old phase plan is done:

- **Phase 1 ✅** — static UI mockup (all CRM pages).
- **Phase 2 ✅** — Supabase Postgres + RLS on every table, Magic Link auth, scoring tables/triggers/decay cron, A&J seed, HubSpot migration, Realtime, data-access layer (`src/lib/data/*`). `mockdata.ts` is no longer a data source.
- **Phase 3 ✅** — Resend integration end-to-end (sequences, webhooks → scoring events, inbound replies), acquisition-channel intake endpoints, Telegram notifications. Plus work beyond the original plan: properties module + web listings, super-admin hub, AI features, per-tenant AI usage tracking (52 migrations as of 2026-07).

**Test suites exist** (Vitest): `npm run test:rls | test:scoring | test:auth | test:import | test:leads | test:routing | test:visibility`. Keep them green; `tests/auth/middleware-matcher.test.ts` mirrors the proxy matcher literal.

### Active phase — Comercialización

Getting the product sellable as a subscription. In order:

1. **Public landing page at `/`** (route group `(marketing)`) — Spanish neutro latino, dark/premium, motion v12, sales-led CTAs ("Contáctanos" form → Resend). Replaces the old redirect-to-login root.
2. **Legal pages** — `/terminos`, `/privacidad`, `/reembolsos`. Entity: UAE (Dubái) with placeholders for the legal name/license; drafts pending lawyer review before paying clients.
3. **Billing / subscriptions** — evaluate Stripe direct vs. Lemon Squeezy (MoR; favored because tenants span US + Spain tax jurisdictions). `subscriptions` data keyed by `tenant_id` with RLS like everything else. Not started.
4. **Tenant onboarding** — provision a new tenant (branding, agents, channels) without manual seed work. Not started.
5. **Advanced analytics (old Phase 5)** — velocity multiplier, reactivation campaigns, per-tenant scoring overrides. Not started.

**Explicitly postponed:** WhatsApp Business Cloud API (old Phase 4) and the ManyChat webhook receiver.

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

### Auth Model — Owner login per tenant + optional agent logins

**The model:** each tenant has one primary Supabase Auth user with the `agent_owner` role and full access to the tenant's data. Additional team agents **can** be invited as `agent`-role logins (invitation flow shipped post-Phase-2); an `agent` sees only their own leads/notifications (`tests/visibility` covers this). Roles live in `src/lib/auth/tenant-context.ts` (`TenantRole = 'super_admin' | 'agent_owner' | 'agent'`).

**Why this matters for the schema:** the `agents` table represents **team members** of the real estate firm, *not* login users. A&J has four agents (Adriana, John, Melanie, Viviane) tracked for lead assignment, language routing, accent colors, and per-agent metrics — but only one of them logs in. Concretely:

- `agents.user_id` is **nullable**. Most rows have `null`. The one agent record that maps to the login user has `user_id = auth.users.id`.
- Lead assignment, lead-magnet ownership, secuencia-de-emails ownership, and analytics are all keyed by `agents.id`, never by `auth.users.id`.
- The login user manages all leads of all agents in their tenant. The CRM is a single-operator tool, even though it tracks a team.

**Why we built it this way:** it preserves ITMANO's differentiator (team-level CRM that gestiona equipos) and keeps the door open to add more login users per tenant later (e.g. give Melanie her own login) without redesigning the data model. Just flip a row's `user_id` from `null` to a real auth user.

**Implication for `super_admin`:** the ITMANO-internal role bypasses tenant filtering via a separate RLS policy that grants access to all tenants. `super_admin` is for Dylan and future ITMANO operators only — never given to clients. **Dylan's super_admin login: `dj.vergara@hotmail.com`** (Magic Link, same method as tenant users).

**Auth method:** Magic Link only (`signInWithOtp`). No passwords are ever set, stored, or reset. The user enters their email, receives a one-time link, and lands authenticated. Reasons: zero passwords to manage, zero password-reuse attack surface, simpler UX for non-technical real estate agents, works on any device with email access, no OAuth provider dependency.

**Current state:** for A&J Real Estate, the owner login is `agent-adriana` authenticated via Magic Link sent to **`adrysofirealestate@gmail.com`** (Adriana's personal Gmail). Other agents may hold `agent`-role logins via invitation; agents without a login remain team members with `agents.user_id = NULL`.

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

The tenant's users receive an immediate notification (in-app bell + Telegram dispatch) when:
- Any lead crosses `current_score ≥ 80` (rising edge — fires once when transitioning from <80 to ≥80, not repeatedly).
- Any new lead is created from the "contáctanos" web form, regardless of score.
- Plus later additions: event-form submissions and inbound email replies.

Notifications carry an `agent_id` scope (agent-role users see only their own). If WhatsApp ships (postponed), the same triggers fan out there. The notification logic lives in a single place — the scoring trigger — and fans out to channels via `/api/notifications/dispatch`.

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
| Animations | `motion` v12 (motion.dev) | Contract in `src/components/motion/README.md`: `m.*` via LazyMotion strict, reduced-motion respected, entrances only on first render. Calm and subtle in the CRM; freer on the marketing landing. |
| Tables | Hand-rolled | If we need sorting/virtualization, evaluate `@tanstack/table` before reinventing |
| Auth | Supabase Auth (live) | Magic Link only, `@supabase/ssr` cookies, closed signups |
| Database | Supabase Postgres (live) | RLS mandatory on every table; 52 migrations in `supabase/migrations/` |
| Realtime | Supabase Realtime (live) | Dashboard pipeline + notification bell |
| CSV/XLSX | `papaparse` + `xlsx` (SheetJS patched build) | Wired in `leads/new`; max 500 rows |
| Email | Resend (live) | Sequences, one-offs, purchase lifecycle, inbound replies, webhooks → scoring |
| AI | `@anthropic-ai/sdk` (live) | `claude-sonnet-5`; usage logged to `ai_usage_events` |
| Notifications | Telegram bot (live) | Fan-out via `/api/notifications/dispatch` |
| WhatsApp | Meta Cloud API direct | Postponed |
| Hosting | Vercel | Preview deploys on every PR; hourly crons via cron-job.org |
| **Forbidden** | AOS, jQuery, any DOM-mutating animation library | They break SSR. |

---

## Commands

```
npm run dev      # Dev server
npm run build    # Production build (run this before opening a PR)
npm run lint     # ESLint
npx tsc --noEmit # Type check without emit — run after any types/* change

npm run test:rls        # RLS tenant-isolation suite (hits the remote DB — serialize, never parallel)
npm run test:scoring    # Scoring triggers / decay
npm run test:auth       # Auth + proxy matcher mirror
npm run test:import     # CSV/XLSX import
npm run test:leads      # Lead flows
npm run test:routing    # Language auto-routing
npm run test:visibility # Agent visibility scope
```

Run the suite(s) that cover the area you touched. If you change `src/proxy.ts`'s matcher, update `tests/auth/middleware-matcher.test.ts` in the same commit — it mirrors the literal.

---

## Repository Structure

```
src/
  app/
    (marketing)/              — PUBLIC: landing page at `/`, /terminos, /privacidad, /reembolsos
    (auth)/login/             — public, dark theme, Magic Link
    auth/                     — OTP callback route
    unsubscribe/              — public signed unsubscribe page
    (dashboard)/              — protected, CRM dark theme
      dashboard/              — pipeline + KPI cards (Realtime)
      leads/                  — list, filters, detail, new (manual + CSV/XLSX import)
      properties/             — agency property listings; asymmetric writes (owner/super: all; agent: own-created). Also the source of truth for the A&J public web (see "Properties — Web Listings & AI Intake"). Media in Supabase Storage bucket `property-media` under `<tenant_id>/properties/`.
      emails/                 — sequences (list/detail/new), AI bootstrap, in-CRM composer
      sources/                — acquisition channels (lead magnets, events, contact forms)
      analytics/              — Server pages + client chart wrappers; /analytics/emails
      lead-magnets/           — CRUD per agent (tracking only — landing pages live outside this app)
      notifications/          — full notification inbox
      activity/               — activity feed
      admin/                  — super_admin hub: platform KPIs, tenant management
      settings/
    api/                      — route handlers for external callers (webhooks, intake, crons)
  components/
    ui/                       — shadcn primitives
    dashboard/                — CRM-specific composites
    marketing/                — landing page components (nav, hero, contact form…)
    motion/                   — motion primitives + README (the motion contract)
  lib/
    types.ts                  — domain types (single source of truth)
    supabase/                 — server.ts, client.ts, admin.ts helpers
    auth/                     — guards (getCurrentTenantContext, assertCanWriteProperty…)
    data/                     — typed data-access functions per entity (server-only)
    services/                 — email sending/metrics, sequence processing, AI helpers
    utils.ts
  proxy.ts                    — Next 16 renamed middleware → proxy; edge auth guard (denylist matcher)
supabase/
  migrations/                 — SQL migrations, sequentially numbered (052+ as of 2026-07)
tests/                        — Vitest suites (rls, scoring, auth, import, leads, routing, visibility)
public/                       — static assets (itmano_logo.webp, itmano_banner.webp…)
```

---

## Email Analytics — Source of Truth

**`email_sends`** is the authoritative table of sent emails. Each row represents one email sent to one lead at one step of one sequence.

**Open rate is intentionally NOT tracked.** Apple Mail Privacy Protection pre-fetches tracking pixels, inflating open rates by >50% in many cases. The metric is unreliable and was removed from all analytics surfaces. **Click rate is the primary engagement metric** — every ITMANO email carries a CTA link, so a click is a real, actionable signal. `email_opened` events are still logged (they contribute +2 to scoring per the Lead Scoring Model) but are never surfaced as a rate.

**Metric derivation** — all rates are distinct-lead-based (never count-based) to avoid inflation from email forwarding:
- **Click rate**: `COUNT(DISTINCT lead_id with 'email_clicked' event after sent_at) / unique_leads_sent` — primary engagement proxy. Any click counts (no per-URL breakdown). Source: Resend `email.clicked` webhook → `email_clicked` lead_event. Requires Click tracking ON in the Resend domain settings.
- **Reply rate**: same pattern with `'email_replied'`. Source: Resend **Inbound** `email.received` webhook → `handleInboundEvent` resolves the lead by sender address (`extractEmail` normalizes `"Name <email>"` → bare lowercased email to match `leads.email`) → `email_replied` lead_event. **Requires Resend Inbound configured (MX records on the reply domain).** Without inbound MX, no `email.received` fires and reply rate stays 0.
- **Bounce rate**: `'email_hard_bounce'` (Resend `email.bounced`) — flag >5% as high.
- **Unsubscribe rate**: `'email_unsubscribed'` — flag >3% as high. Source: the `/unsubscribe` page (signed link) inserts the event idempotently. Note: spam complaints (`email.complained`) map to `email_spam_complaint` (−100 score, force `perdido`) and are NOT folded into unsubscribe rate.

**Helper: `src/lib/services/email-metrics.ts`**
- `getSequenceMetrics(sequenceId)` → `SequenceMetrics` for one sequence
- `getStepMetrics(sequenceId)` → `StepMetric[]` grouped by `step_order`
- `getGlobalEmailMetrics(tenantId | null)` → aggregate + per-sequence breakdown; `null` = super_admin, sees all tenants

**Implementation**: pure TypeScript server functions (no RPC). Fetches runs → sends → events in 3 queries, computes in-process. Suitable for current data volumes; add a Postgres `email_metrics_view` if query time exceeds 500ms at scale.

**LM analytics vs email analytics**: Lead-magnet analytics (channels, page views, conversions) live in `src/lib/data/channels.ts` and the `(dashboard)/analytics/page.tsx` FILA 7. Email send/engagement analytics live in `email-metrics.ts` and `(dashboard)/analytics/emails/page.tsx`. Do not mix these.

**Sequence processing architecture — `processSequenceRun` is the shared unit of work.**
`src/lib/services/process-sequence-run.ts` processes ONE run by ID: it assembles the run's joined data (lead, agent, tenant, current step, channel), runs the validation guards, and on the production path delegates the actual send to `sendSequenceEmail` (Resend call → insert `email_sends` → advance/complete the run). It does NOT filter by `next_send_at` — the caller decides eligibility. Two callers share it:
- **Hourly orchestrator** (`/api/cron/sequence-orchestrator`): queries eligible runs (`next_send_at <= NOW()`, `status='active'`, optional `?lead_id=`), then loops calling `processSequenceRun` per run. Supports `?dry_run=true` for a per-run diagnostic report.
- **Enrollment** (`enrollLeadInSequence` and `addLeadsToSequence`): after inserting the run, calls `processSequenceRun` **directly, in-process** (same DB connection, `await`) so the first email sends in seconds.

**Why in-process, not an HTTP self-call:** earlier versions POSTed to the orchestrator endpoint (with and without `after()`/`waitUntil`). That was unreliable on Vercel — a separate serverless invocation re-ran the `next_send_at <= NOW()` query against a different connection (row-visibility race) plus an unnecessary network hop. Calling `processSequenceRun` directly on the just-committed run eliminates both. No `CRON_SECRET` needed in the enrollment path anymore.

**Send timing — bifurcated behavior:**
- **First email:** Sent immediately on enrollment via the direct in-process call. Reaches the inbox in seconds.
- **Subsequent emails (step 1+):** Sent by the hourly cron-job.org trigger. After each successful send, `sendSequenceEmail` sets `next_send_at = sent_at + next_step.delay_hours`; the orchestrator picks it up when due.
- **No double-send:** after the immediate send, the run is advanced (`current_step_order++`, `next_send_at` moved to the future) or marked `completed` — so the next cron tick does not reprocess it.
- **Fallback:** if the in-process first send throws, enrollment still succeeds (never rolled back) and the hourly cron processes the run later. Worst-case timing degrades to 1 hour; no data lost.

---

## Form Submissions — Answers Snapshot Contract

`form_submissions` is the structured, per-submission record used to display the
questions/answers a lead gave on a form. **There is no form-schema table** — the
form sends a self-describing, human-readable snapshot and the CRM stores it
verbatim. This is intentional: lead-magnet/event/contact forms each have
arbitrary fields, and we do not want a schema migration every time a form changes.

**`form_submissions` is NOT a replacement for `lead_events`.** They are different
concerns and both are written:
- `lead_events` = append-only activity log + scoring source (drives status/score).
- `form_submissions` = structured display record of one form submit (the Q&A).

A submission row carries `tenant_id`, `channel_id` (uuid), `lead_id` (text — `leads.id`
is text), `answers jsonb`, `responded`/`responded_at` (manual toggle for event/contact
follow-up; lead-magnet does not use it), and `submitted_at`.

**`answers` format** — an ordered array (order preserved) of self-describing items:

```json
[
  { "key": "timeline", "question": "¿Cuál es tu horizonte de compra?",
    "value": "less_3_months", "label": "Menos de 3 meses" }
]
```

- `key` — the form's `variable_name` for the field (required).
- `question` — the human-readable question text (optional, for robustness).
- `value` — the raw value (option code or free text) (required).
- `label` — the human-readable answer (for selects, the option label; for free
  text, `label` = `value`) (optional).

**Personal data (name, email, phone) does NOT go in `answers`** — it lives on the
`leads` row. `answers` is only the qualifying Q&A.

`leads.metadata.quiz_answers` is **deprecated** as an answer store (the intake
endpoint no longer writes it). New answers live in `form_submissions`. The
`metadata` column itself is kept (it may hold other things).

**Who writes a submission:**
- LP intake (`/api/intake/[publicId]/submit`) — accepts a `form_answers` array and
  writes one row per submit. `event` channels also fire an `event_submission`
  notification; `lead_magnet` channels do not notify.
- Contact (`handleContactSubmission`, used by the Webflow webhook + backup endpoint)
  — writes a single-item `answers` snapshot of the message, plus the existing
  `contact_us_question` event + `contact_us` notification.

**Two dedup layers (LP intake) — distinct and independent:**
1. **Lead** — unique per `(tenant_id, email)`. A repeat email merges personal
   fields into the existing lead (and logs a `lead_resubmitted` +5 event). Unchanged.
2. **Submission** — per `(lead_id, channel_id)`, **only for `lead_magnet` & `event`**.
   If the lead already submitted *that* form, the existing `form_submissions` row
   is **updated** (`answers` overwritten, `submitted_at = now`) instead of inserting
   a new one — and there is **no** re-enrollment, no re-sent material, and no new
   `event_submission` notification. First submission for a `(lead, channel)` →
   enroll/send material (and notify for `event`). `contact_form`/`manychat`/`manual`
   are **exempt**: one `form_submissions` row per submit (Contact Us included).

**Intake response the LP consumes:** `{ ok: true, status: 'created' | 'already_submitted', channel_type }`.
`created` = first submission for this `(lead, channel)` (material/enrollment happened);
`already_submitted` = the lead had already sent this form (answers refreshed, nothing
re-sent). A lead magnet with no linked sequence still returns `already_submitted` on
re-submit — the LP decides the message (there's just no material to re-send).

---

## Properties — Web Listings & AI Intake

The `properties` table is a **single source of truth**: it powers the internal CRM
module *and* the A&J public marketing site (`E:\A&J\Web\main-web-ajreg`, which reads
it directly with the CRM's anon key). Built across migrations `042` (base table +
asymmetric-write RLS), `045` (web columns + anon SELECT policy for published rows +
public `property-media` Storage bucket), `046` (seed of the 3 A&J listings), and
`047` (column-level `anon` privileges).

**Data contract & security:**
- Web-facing columns on `properties`: `name`, `slug` (unique per tenant; the web URL
  `/houses/<slug>`), `neighborhood`, `state`, `bathrooms_full`/`bathrooms_half`,
  `garage_spaces`, `lot_sqft`, `description_en`/`description_es`,
  `features_en`/`features_es` (text[]), `image_url`, `gallery` (text[]),
  `floor_plans` (text[]), `detail_pdf_url`, `published_to_web`. The legacy
  `bathrooms` numeric stays coherent (`full + 0.5 × half`, computed on save).
- **Public exposure is two-layered:** an RLS policy (`045`) limits `anon` to rows
  with `published_to_web = true`; column-level grants (`047`) limit `anon` to the
  public columns only. `notes`, `created_by_*`, `mls_number`, `external_url` and the
  legacy `bathrooms` are **withheld from `anon`** — so the web MUST select explicit
  columns (`select('*')` returns 401 for anon). `authenticated`/service role are
  unaffected; the CRM reads via the service-role admin client.
- **Media** lives in the public Storage bucket `property-media` under
  `<tenant_id>/properties/` (AI-intake PDFs under `<tenant_id>/properties/ai-intake/`).
  Uploads go through the service-role client only (`uploadPropertyMedia` in
  `properties/actions.ts`); the bucket is public-read by URL. **When a new host serves
  these images, add it to the web project's `next.config.ts` `images.remotePatterns`**
  — `next/image` blocks unlisted hosts (this is why images silently failed after the
  web repointed from the AJREG project to the CRM project).

**"Crear con IA" (Phase D) — built but GATED OFF.**
`properties/ai-actions.ts#generatePropertyFromPdf` uploads a listing PDF and calls
Claude (`claude-sonnet-5`, PDF as a base64 `document` block + forced tool use) to
prefill the form for human review (`published_to_web` always starts false; photos are
uploaded by hand, not extracted). The UI entry point is **disabled** behind
`AI_ENABLED = false` in `properties-client.tsx` (shows a "Próximamente" badge).

*Pending before enabling the Claude API feature (flip `AI_ENABLED` to `true`):*
1. Set `ANTHROPIC_API_KEY` in `.env.local` **and** in Vercel (Production + Preview).
2. Confirm Anthropic billing/credits are provisioned for the workspace.
3. Verify the model id is still current (`claude-sonnet-5`) per `node_modules` docs /
   the Claude API skill before shipping.
4. Manually QA one real listing PDF end-to-end (extraction → prefill → review → save),
   plus the error paths (non-listing PDF, > 10 MB, missing key).
5. (Optional) add a cleanup job for orphaned `ai-intake` PDFs when a draft is cancelled.

---

## Route Groups & Layouts

| Group | Path prefix | Theme | Auth |
|---|---|---|---|
| `(marketing)` | `/`, `/terminos`, `/privacidad`, `/reembolsos` | Dark premium (same tokens), marketing nav + footer | Public |
| `(auth)` | `/login` | Dark | Public |
| `(dashboard)` | `/dashboard`, `/leads`, `/properties`, `/emails`, `/sources`, `/analytics`, `/analytics/emails`, `/lead-magnets`, `/notifications`, `/activity`, `/admin`, `/settings` | Dark premium (CSS vars) | Protected (`src/proxy.ts` + `getCurrentTenantContext`) |

The `(dashboard)` layout wraps content in a fixed 220px `Sidebar` + `Topbar` + main area. The `(marketing)` layout is nav + footer only. Both share the same design tokens — one visual identity across the product.

---

## Domain Types — Source of Truth: `src/lib/types.ts`

```
LeadStatus:       new → nurturing → warm → hot → process_started → process_completed → closed | lost
AgentSpecialty:   hispanic | military | first_buyer | brazilian
LeadSourceType:   lead_magnet | web_form | open_house | manual | ads | referral
Language:         es | en | pt
```

Read the file before adding any field. When extending it, also extend `STATUS_CONFIG` / `LANGUAGE_CONFIG` in `src/lib/config.ts` to keep labels/colors consistent. (Statuses are English in code, Spanish in the UI labels.)

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

The contract to preserve:

- Columns: `firstName`, `lastName`, `email`, `phone`, `language`, `agentId`, `sourceType`, `lender`, `notes`.
- Max 500 rows.
- Comment lines starting with `#` are skipped in CSV.
- `papaparse` for CSV, `xlsx` (patched SheetJS build) for XLSX.
- The import writes to the `leads` table inside a single transaction, with `tenant_id` derived from the authenticated user. Partial failures roll back. Covered by `npm run test:import`.

---

## Hard Rules — Never Cross These

1. **Never commit directly to `main`.** Always a feature branch + PR. Branch naming: `feat/<short-slug>`, `fix/<short-slug>`, `chore/<short-slug>`, `design/<short-slug>`.
2. **Never commit secrets.** No keys in code, no keys in `.env.example`. `.env.example` lists variable *names* only.
3. **Never bypass RLS.** No `service_role` key in the browser. No code that fetches data without going through an authenticated Supabase client (server-side) or a server-side data function.
4. **Never hardcode tenant data.** A&J's name, color, logo, slug, agents — all come from the database.
5. **Never use AOS, jQuery, or any DOM-mutating library.** They break SSR.
6. **Never run destructive operations without a plan.** `DROP TABLE`, `TRUNCATE`, `rm -rf`, mass deletes — describe what will happen first, get confirmation, then act.
7. **Never copy a snippet from this CLAUDE.md as if it were code.** The file referenced is the source of truth.
8. **Never expose internal IDs in URLs that don't need them.** Use slugs where the user-facing route benefits (e.g. `/lm/guia-familias-hispanas`); use IDs where uniqueness matters (e.g. `/leads/<uuid>`).
9. **Never start a postponed or future-roadmap feature** (WhatsApp, billing integration, tenant self-serve signup) unless explicitly asked.

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
| Anything that uses leads, agents, sources, lead magnets | `src/lib/types.ts`, `src/lib/config.ts`, the relevant `src/lib/data/*.ts` |
| The marketing landing or legal pages | `src/app/(marketing)/`, `src/components/marketing/`, `src/components/motion/README.md` |
| Anything in `properties/` | `src/lib/data/properties.ts` (types), `src/lib/auth/guards.ts` (`assertCanWriteProperty`), the "Properties — Web Listings & AI Intake" section, and migrations `042_properties.sql` + `045`–`047` |
| Anything that touches scoring, status auto-transitions, or notifications | The "Lead Scoring Model" section above, then the scoring migration files in `supabase/migrations/` |
| Anything in `(dashboard)` | `src/app/globals.css` (design tokens), the closest existing page |
| A new chart | An existing chart under `analytics/charts/` |
| Auth or the proxy (middleware) | `src/proxy.ts`, `src/lib/auth/tenant-context.ts`, and Supabase SSR docs at https://supabase.com/docs/guides/auth/server-side/nextjs |
| Migrations or RLS | The most recent migration file in `supabase/migrations/` |
| Routing, layouts, or server actions | The Next.js 16 guide in `node_modules/next/dist/docs/` |

---

## Roadmap (informational — do not start without explicit instruction)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Static UI mockup (all CRM pages) | ✅ Shipped |
| **Phase 2** | Supabase Auth (Magic Link) + DB + RLS + Realtime; scoring tables + triggers + hourly decay cron; A&J seed; HubSpot 114-contact migration | ✅ Shipped |
| **Phase 3** | Resend end-to-end (sequences, webhooks → scoring, inbound replies); intake endpoints; Telegram notifications; plus properties module, super-admin hub, AI features, AI usage tracking | ✅ Shipped |
| **Comercialización — landing + legal** | Public landing at `/` (route group `(marketing)`), pricing sales-led, contact form via Resend; `/terminos`, `/privacidad`, `/reembolsos` (UAE entity, drafts pending lawyer review) | 🚧 **Active** |
| Billing / suscripciones | Payment integration (Stripe direct vs. Lemon Squeezy MoR — MoR favored for US+Spain tax); `subscriptions` keyed by `tenant_id` with RLS | ⏳ Next |
| Tenant onboarding | Provision a new tenant (branding, agents, channels) without manual seed work | ⏳ |
| Analytics avanzado (old Phase 5) | Velocity multiplier; reactivation campaigns; per-tenant scoring overrides | ⏳ |
| WhatsApp (old Phase 4) | Meta Cloud API; notification fan-out to WhatsApp; ManyChat receiver | ⏸️ Postponed |

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