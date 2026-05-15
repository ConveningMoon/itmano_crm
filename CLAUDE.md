# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (Next.js)
npm run build    # Production build
npm run lint     # ESLint (eslint.config.mjs)
```

No test suite exists yet. There is no test command.

## Next.js Version Warning

This project uses **Next.js 16.2.4** with **React 19.2.4** and **Tailwind CSS v4**. These versions have breaking changes from what most training data covers. Before writing code that touches routing, layouts, or config, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.

## Architecture Overview

Multi-tenant SaaS CRM for real estate teams. Currently **Phase 1: UI mockup only** — all data is static, there is no backend, no database, no auth. The app is structured around two completely separate UX contexts:

### Route Groups

| Group | Path prefix | Purpose | Theme |
|---|---|---|---|
| `(dashboard)` | `/dashboard`, `/leads`, `/analytics`, `/lead-magnets`, `/settings` | CRM interface for agents | Dark premium — CSS variables |
| `(funnel)` | `/lm/guia-familias-hispanas/` | Public lead magnet landing pages | Warm light — `C` object |
| `(auth)` | `/login` | Login page | Dark |

The `(dashboard)` layout wraps content in a fixed 220px `Sidebar` + `Topbar` + main area. The `(funnel)` layout loads Cormorant Garamond font and sets a light `#FAFAF8` background.

### TypeScript Path Alias

`@/*` resolves to `./src/*`. Always use this alias for imports.

### Data Layer (Phase 1)

All data lives in `src/lib/mockdata.ts`. **No fetch(), no API calls, no Supabase.** Import directly:

```ts
import { MOCK_LEADS, MOCK_AGENTS, STATUS_CONFIG } from '@/lib/mockdata'
```

Key exports: `MOCK_TENANT`, `MOCK_AGENTS`, `MOCK_SOURCES`, `MOCK_LEADS` (75 total), `MOCK_LEAD_MAGNETS`, `STATUS_CONFIG`, `SOURCE_CONFIG`, `LANGUAGE_CONFIG`, and helper functions `getAgentById`, `getSourceById`, `getLeadsByAgent`, `getLeadsStats`, `getLMsByAgent`, `getActiveLMs`.

### Domain Types (`src/lib/types.ts`)

```ts
LeadStatus: 'new' | 'nurturing' | 'warm' | 'hot' | 'process_started' | 'process_completed' | 'closed' | 'lost'
AgentSpecialty: 'hispanic' | 'military' | 'first_buyer' | 'brazilian'
LeadSourceType: 'lead_magnet' | 'web_form' | 'open_house' | 'manual' | 'ads' | 'referral'
Language: 'es' | 'en' | 'pt'
```

Status flow: `new → nurturing → warm → hot → process_started → process_completed → closed | lost`

## Design System

### CRM (dark) — use CSS variables

All CRM-context components must use CSS variables. Never hardcode hex colors in `(dashboard)` components.

```css
/* Backgrounds */
--bg-base: #0B0C0E       --bg-surface: #111215
--bg-elevated: #16181C   --bg-overlay: #1C1F24

/* Text */
--text-primary: #E8E6E1  --text-secondary: #A09D95  --text-muted: #6B6860

/* Accents */
--accent-gold: #C9A96E   --accent-gold-dim: #A08445
--accent-blue: #5B8EC9   --accent-teal: #5AAFA0
--accent-coral: #C97B6B  --accent-pink: #B87BA3   --accent-green: #6BA368

/* Borders */
--border-subtle: rgba(255,255,255,0.06)   --border-accent: rgba(201,169,110,0.15)

/* Status colors */
--status-new: #5B8EC9  --status-nurturing: #C9A96E  --status-warm: #E07B3A
--status-hot: #E04040  --status-process-started: #9B72CF
--status-process-completed: #6BA368  --status-closed: #4A9B6B  --status-lost: #C97B6B
```

Tailwind can reference these via `bg-bg-base`, `text-accent-gold`, etc. (mapped in `@theme inline` block in `globals.css`).

### Funnel (warm light) — use the `C` object

All funnel pages define and use a local `C` constant (see `src/app/(funnel)/lm/guia-familias-hispanas/page.tsx`). Never use CSS variables in funnel pages.

```ts
const C = {
  navy: '#1B2F5B', navyMid: '#2A4580', navyLight: '#3A5A9B', navyDark: '#0F1F3D',
  gold: '#C9A96E', goldLight: '#E8C98A', goldDim: '#A08445',
  white: '#FFFFFF', offWhite: '#FAFAF8', gray: '#F3F2F0', grayMid: '#E2DDD8',
  textDark: '#1B2F5B', textMid: '#4A5568', textLight: '#8A96A8',
  green: '#2D7A4F', greenBg: '#EBF7F1', coral: '#C97B6B',
}
```

### Typography

- CRM: Inter (300/400/500/600), loaded via Google Fonts in `globals.css`
- Funnel headings: Cormorant Garamond (italic/serif), loaded in `(funnel)/layout.tsx`
- Base font size: 14px

### Border radii

- Cards/panels: `12px`
- Inputs/buttons: `8px`
- Badges: `4px–6px`
- Avatars: `50%`

## Component Patterns

### Server vs Client

Default to Server Components. Add `'use client'` only when the component uses:
- `useState`, `useEffect`, `useRef`, or other React hooks
- `framer-motion` animations
- `recharts` charts
- `useRouter`, `useParams`

**Never import recharts in a Server Component.** The analytics page pattern is: Server Component computes data → passes to `'use client'` chart wrappers.

**Never use the AOS library** — it breaks Next.js SSR.

### Charts pattern

Server page computes data, passes as props to a `'use client'` chart component:

```tsx
// analytics/page.tsx (Server Component)
const data = MOCK_AGENTS.map(...)
return <MyChart data={data} />

// analytics/charts/my-chart.tsx
'use client'
import { BarChart, Bar } from 'recharts'
export function MyChart({ data }: ...) { ... }
```

### Animation pattern (funnel only)

The funnel page defines local helper components (`FadeUp`, `FloatLoop`, `StaggerList`, `Particles`) that wrap `framer-motion`. Reuse this pattern rather than importing motion directly in markup.

### Tabs pattern (Client island in Server page)

When a Server Component page needs tabs, extract only the tab state into a minimal `'use client'` component (see `lead-magnets/lm-tabs.tsx`) and pass the pre-rendered Server content as props/children.

### Hover interactions

CSS class + `<style>` tag at the top of the component. Pattern used throughout:

```tsx
<style>{`
  .card:hover { border-color: var(--border-accent) !important; transform: translateY(-1px); }
`}</style>
```

## Agents (A&J Real Estate Group tenant)

| ID | Name | Specialty | Language | Accent color |
|---|---|---|---|---|
| `agent-adriana` | Adriana Melendez | hispanic | es | `#5B8EC9` (blue) |
| `agent-john` | John Leonard | military | en | `#5AAFA0` (teal) |
| `agent-melanie` | Melanie Valencia | first_buyer | es | `#C97B6B` (coral) |
| `agent-viviane` | Viviane Chiu | brazilian | pt | `#B87BA3` (pink) |

Agent accent color is used for avatar backgrounds at 15% opacity (`${color}26`).

Language auto-assigns agents: `es → agent-adriana`, `en → agent-john`, `pt → agent-viviane`.

## CSV/XLSX Import (leads/new)

Import expects these columns: `firstName`, `lastName`, `email`, `phone`, `language`, `agentId`, `sourceType`, `lender`, `notes`. Parsed with `papaparse` (CSV) and `xlsx` (XLSX). Max 500 rows. Comment lines starting with `#` are skipped in CSV.

## Public Assets

| File | Purpose |
|---|---|
| `adriana_face.JPG` | Adriana's photo — used in funnel hero and agent bio section |
| `mockup.png` | Guide book mockup — used in funnel hero (FloatLoop animation) |
| `family_home.png` | Family/home image (available, not yet used in funnel) |

## Phase Boundaries

**Phase 1 (current):** Static UI with `mockdata.ts`. Do not add any of the following until Phase 1 is approved and deployed:
- Supabase client, auth, or DB calls
- `fetch()` or any server-side data fetching
- Email (Resend) or WhatsApp (Meta Cloud API) integration
- Environment variables beyond what's in `.env.example`

**Phase 2 (planned):** Supabase Auth (roles: `super_admin`, `agent_owner`), PostgreSQL with RLS by `tenant_id`, Realtime dashboard, Edge Functions for email/WhatsApp triggers.
