<p align="center">
  <img src="public/itmano_logo.webp" alt="ITMANO" width="96" />
</p>

<h1 align="center">ITMANO CRM</h1>

<p align="center">
  The live dashboard that replaces the monthly PDF report.<br />
  A white-label, multi-tenant CRM for real-estate growth teams.
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-24.20-339933?logo=node.js&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Proprietary-lightgrey">
</p>

## What this is

ITMANO CRM is the product surface of ITMANO's Growth Partner service:
acquisition, lead qualification, nurturing and conversion behind one branded
login at `app.itmano.com`.

It is sold sales-led on Esencial, Growth and Partner plans. New tenants start on
a 14-day Growth trial. [`src/lib/plans.ts`](src/lib/plans.ts) is the source of
truth for the current feature matrix and prices.

## Product capabilities

| Area | What it does |
|---|---|
| Pipeline | Leads grouped by agent-controlled stage, with system quality and urgency signals |
| Leads | Search, filters, detail, manual entry and CSV/XLSX import up to 500 rows |
| Email | Resend sequences, one-off messages, inbound replies and delivery/blocking guards |
| Properties | Listings and Supabase Storage media, also exposed to approved public sites |
| Acquisition | Lead magnets, events, contact forms and signed Webflow intake |
| Newsletters | One public newsletter per tenant with AI-assisted editions and analytics |
| Analytics | Tenant, agent, channel, email and platform-level views |
| Notifications | In-app and Telegram notifications for configured operational events |
| Admin | Tenant management, platform KPIs and support tenant switching |

The repository contains no active Supabase Realtime subscriptions. UI state is
refreshed through Server Actions, route responses and controlled polling where a
long-running process requires it.

## Scoring model

Postgres is authoritative. `recompute_lead_score(lead_id)` combines fit,
engagement and manual signals, clamped from 0 to 100. Stage, quality and urgency
are separate axes:

- Agents control pipeline stage.
- The system derives quality bands from each tenant's active portfolio.
- Urgency reflects decaying positive engagement.
- Email opens are not a scoring signal; clicks and replies are.
- Scoring continues after a lead moves into an active or closed stage.
- A daily cron materializes event-level decay.

See [`docs/agents/scoring.md`](docs/agents/scoring.md) for the rationale. Current
weights live in Supabase, not in documentation.

## Architecture

```text
Browser
  -> Next.js 16 App Router
       -> Server Components and Server Actions
       -> src/lib/data/* (server-only reads)
       -> src/lib/services/* (domain workflows)
  -> Supabase Postgres (RLS + tenant filters)
       -> Storage
  -> Resend / Telegram / AI providers through server-only integrations
```

Every application table and query is tenant-scoped. `agents` represents members
of a real-estate team; login identities are optional links through
`agents.user_id`. Auth uses closed Magic Link registration with `super_admin`,
`agent_owner` and `agent` roles.

## Runtime and setup

The project pins Node 24.20.0 and npm 11.19.0 through Volta. Install Volta and
`uv`, then:

```bash
volta install node@24.20.0 npm@11.19.0
uv tool install "graphifyy[sql]==0.9.55"
npm ci
npm run setup:hooks
npm run dev
```

Copy the variables you need from [`.env.example`](.env.example) into local,
ignored environment files. Local development must point Supabase to the sandbox.
Other provider keys can still spend money or send real messages; see
[`docs/agents/environments.md`](docs/agents/environments.md).

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run build
```

Database-backed suites are serial and target a shared sandbox:

```bash
npm run check:db-targets
npm run test:schema
npm run test:rls
npm run test:scoring
npm run test:ai-limits
npm run test:sources
```

## Repository map

```text
src/app/                 routes, layouts and UI surfaces
src/lib/data/            typed server-side reads
src/lib/services/        domain workflows and integrations
src/lib/auth/            tenant context and authorization guards
supabase/migrations/     sequential schema and corrective migrations
supabase/seeds/          explicit non-production seed data
tests/                   Vitest suites by concern
docs/agents/             durable product and engineering context for agents
```

## Working with Claude Code and Codex

[`AGENTS.md`](AGENTS.md) is the shared operating contract. [`CLAUDE.md`](CLAUDE.md)
is a thin Claude Code adapter. Both agents use the same versioned Supabase skills,
project-scoped sandbox MCP and Git handoff protocol.

Use one active agent and one computer per branch. Transfer work through commits
and GitHub, never through OneDrive or stashes. Full setup and handoff instructions
are in [`docs/agents/workflow.md`](docs/agents/workflow.md).

## Deployment status

Vercel deploys the application at `app.itmano.com`; scheduled endpoints are
called by external cron infrastructure and authenticate with `CRON_SECRET`.
Paddle billing is implemented in code, while the live commercial state must be
verified before making product or financial claims. Legal copy remains pending
professional review.

<p align="center"><sub>Proprietary — © ITMANO. Not open source.</sub></p>
