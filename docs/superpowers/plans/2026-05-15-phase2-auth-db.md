# Phase 2: Auth + DB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `mockdata.ts` layer with a real Supabase backend — PostgreSQL schema, Row Level Security, and Supabase Auth.

**Architecture:** Server Components query Supabase directly via the SSR client (cookies-based session). Client Component pages get thin Server Component wrappers that fetch data and pass it as props, keeping existing UI code mostly unchanged. Mapper functions convert snake_case DB rows to camelCase domain types so the UI doesn't need field-name rewrites. Middleware handles session refresh and auth-guards all `(dashboard)` routes.

**Tech Stack:** Next.js 16.2.4, @supabase/supabase-js, @supabase/ssr, TypeScript 5

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Full DB schema + helper functions + RLS |
| `src/lib/supabase/client.ts` | Browser Supabase client (Client Components) |
| `src/lib/supabase/server.ts` | SSR Supabase client (Server Components, async cookies) |
| `src/middleware.ts` | Session refresh + auth guard for (dashboard) routes |
| `src/lib/config.ts` | STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG (moved from mockdata) |
| `src/lib/db.ts` | DB row types + mapper functions (snake_case → camelCase) |
| `src/app/(dashboard)/leads/leads-client.tsx` | Current leads/page.tsx renamed (Client Component) |
| `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx` | Current leads/[id]/page.tsx renamed |
| `src/app/(dashboard)/leads/new/new-lead-client.tsx` | Current leads/new/page.tsx renamed |
| `src/app/(dashboard)/leads/new/actions.ts` | Server Actions for lead creation |

### Modified files
| File | Change |
|---|---|
| `src/lib/types.ts` | Add UserProfile type; existing domain types stay |
| `.env.local` | Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY |
| `.env.example` | Same vars as template |
| `src/app/(auth)/login/page.tsx` | Real Supabase email + password auth |
| `src/app/(dashboard)/dashboard/page.tsx` | Supabase queries replacing mockdata |
| `src/app/(dashboard)/analytics/page.tsx` | Supabase queries replacing mockdata |
| `src/app/(dashboard)/lead-magnets/page.tsx` | Supabase queries replacing mockdata |
| `src/app/(dashboard)/leads/page.tsx` | Thin Server Component wrapper |
| `src/app/(dashboard)/leads/[id]/page.tsx` | Thin Server Component wrapper |
| `src/app/(dashboard)/leads/new/page.tsx` | Thin Server Component wrapper |

### Deleted
- `src/lib/mockdata.ts` (Task 13)

---

## Task 1: Install packages and configure environment

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.local`
- Modify: `.env.example`

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Expected output: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create `.env.local` with your Supabase credentials**

Get these from your Supabase project → Settings → API.

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
```

- [ ] **Step 3: Update `.env.example`**

Read the current `.env.example`, then add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds. (No code changes yet — just confirming env setup doesn't break anything.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: install @supabase/supabase-js and @supabase/ssr"
```

---

## Task 2: Create SQL migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/001_initial_schema.sql` with the full content below:

```sql
-- ─── Helper functions ───────────────────────────────────────────────────────

create or replace function get_my_tenant_id()
returns text language sql security definer stable as $$
  select tenant_id from user_profiles where id = auth.uid()
$$;

create or replace function is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from user_profiles where id = auth.uid() and role = 'super_admin'
  )
$$;

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table tenants (
  id            text        primary key,
  name          text        not null,
  slug          text        unique not null,
  logo_url      text,
  primary_color text        not null default '#1E3A5F',
  created_at    timestamptz default now()
);

create table user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  text references tenants(id),
  role       text not null check (role in ('super_admin', 'agent_owner')),
  created_at timestamptz default now()
);

create table agents (
  id               text        primary key,
  tenant_id        text        not null references tenants(id),
  name             text        not null,
  email            text        not null,
  phone            text,
  language         text        not null check (language in ('es', 'en', 'pt')),
  specialty        text        not null check (specialty in ('hispanic', 'military', 'first_buyer', 'brazilian')),
  avatar_initials  text        not null,
  accent_color     text        not null,
  active           boolean     not null default true,
  created_at       timestamptz default now()
);

create table lead_sources (
  id         text        primary key,
  tenant_id  text        not null references tenants(id),
  name       text        not null,
  type       text        not null check (type in ('lead_magnet', 'web_form', 'open_house', 'manual', 'ads', 'referral')),
  created_at timestamptz default now()
);

create table lead_magnets (
  id          text        primary key,
  tenant_id   text        not null references tenants(id),
  agent_id    text        not null references agents(id),
  title       text        not null,
  subtitle    text        not null,
  language    text        not null check (language in ('es', 'en', 'pt')),
  month_year  text        not null,
  cover_emoji text        not null,
  page_url    text        not null,
  active      boolean     not null default true,
  created_at  timestamptz default now()
);

create table leads (
  id                text        primary key,
  tenant_id         text        not null references tenants(id),
  agent_id          text        not null references agents(id),
  source_id         text        not null references lead_sources(id),
  first_name        text        not null,
  last_name         text        not null,
  email             text        not null,
  phone             text,
  language          text        not null check (language in ('es', 'en', 'pt')),
  status            text        not null check (status in ('new', 'nurturing', 'warm', 'hot', 'process_started', 'process_completed', 'closed', 'lost')),
  temperature_score integer     not null default 0,
  lender            text,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table lead_events (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     text        not null references leads(id) on delete cascade,
  tenant_id   text        not null references tenants(id),
  type        text        not null,
  description text        not null,
  created_at  timestamptz default now()
);

-- ─── RLS: enable ────────────────────────────────────────────────────────────

alter table tenants       enable row level security;
alter table user_profiles enable row level security;
alter table agents        enable row level security;
alter table lead_sources  enable row level security;
alter table lead_magnets  enable row level security;
alter table leads         enable row level security;
alter table lead_events   enable row level security;

-- ─── RLS: tenants ───────────────────────────────────────────────────────────

create policy "tenants_select" on tenants
  for select using (is_super_admin() or id = get_my_tenant_id());

-- ─── RLS: user_profiles ─────────────────────────────────────────────────────

create policy "user_profiles_select" on user_profiles
  for select using (id = auth.uid() or is_super_admin());

-- ─── RLS: agents ────────────────────────────────────────────────────────────

create policy "agents_select" on agents
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "agents_insert" on agents
  for insert with check (tenant_id = get_my_tenant_id());

create policy "agents_update" on agents
  for update using (tenant_id = get_my_tenant_id());

create policy "agents_delete" on agents
  for delete using (tenant_id = get_my_tenant_id());

-- ─── RLS: lead_sources ──────────────────────────────────────────────────────

create policy "lead_sources_select" on lead_sources
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_sources_insert" on lead_sources
  for insert with check (tenant_id = get_my_tenant_id());

create policy "lead_sources_update" on lead_sources
  for update using (tenant_id = get_my_tenant_id());

create policy "lead_sources_delete" on lead_sources
  for delete using (tenant_id = get_my_tenant_id());

-- ─── RLS: lead_magnets ──────────────────────────────────────────────────────

create policy "lead_magnets_select" on lead_magnets
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_magnets_insert" on lead_magnets
  for insert with check (tenant_id = get_my_tenant_id());

create policy "lead_magnets_update" on lead_magnets
  for update using (tenant_id = get_my_tenant_id());

create policy "lead_magnets_delete" on lead_magnets
  for delete using (tenant_id = get_my_tenant_id());

-- ─── RLS: leads ─────────────────────────────────────────────────────────────

create policy "leads_select" on leads
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "leads_insert" on leads
  for insert with check (tenant_id = get_my_tenant_id());

create policy "leads_update" on leads
  for update using (tenant_id = get_my_tenant_id());

create policy "leads_delete" on leads
  for delete using (tenant_id = get_my_tenant_id());

-- ─── RLS: lead_events ───────────────────────────────────────────────────────

create policy "lead_events_select" on lead_events
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "lead_events_insert" on lead_events
  for insert with check (tenant_id = get_my_tenant_id());

create policy "lead_events_update" on lead_events
  for update using (tenant_id = get_my_tenant_id());

create policy "lead_events_delete" on lead_events
  for delete using (tenant_id = get_my_tenant_id());
```

- [ ] **Step 2: Run the migration in Supabase**

Open Supabase dashboard → SQL Editor → paste the full file content → Run.

Verify in Table Editor that all 7 tables appear: `tenants`, `user_profiles`, `agents`, `lead_sources`, `lead_magnets`, `leads`, `lead_events`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add initial Supabase schema with RLS"
```

---

## Task 3: Supabase client utilities

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Create browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create SSR server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components can't set cookies — middleware handles this
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors. Both files resolve their imports cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/
git commit -m "feat: add Supabase browser and SSR client utilities"
```

---

## Task 4: Extract UI configs and add DB types

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/db.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create `src/lib/config.ts`**

Move the three pure-UI config constants out of `mockdata.ts`:

```ts
export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  new:               { label: 'Nuevo',             color: '#5B8EC9', bgColor: 'rgba(91,142,201,0.12)' },
  nurturing:         { label: 'Nurturing',          color: '#C9A96E', bgColor: 'rgba(201,169,110,0.12)' },
  warm:              { label: 'Tibio',              color: '#E07B3A', bgColor: 'rgba(224,123,58,0.12)' },
  hot:               { label: 'Caliente',           color: '#E04040', bgColor: 'rgba(224,64,64,0.12)' },
  process_started:   { label: 'En Proceso',         color: '#9B72CF', bgColor: 'rgba(155,114,207,0.12)' },
  process_completed: { label: 'Proceso Completado', color: '#6BA368', bgColor: 'rgba(107,163,104,0.12)' },
  closed:            { label: 'Cerrado',            color: '#4A9B6B', bgColor: 'rgba(74,155,107,0.12)' },
  lost:              { label: 'Perdido',            color: '#C97B6B', bgColor: 'rgba(201,123,107,0.12)' },
}

export const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  lead_magnet: { label: 'Lead Magnet',    icon: '📄' },
  web_form:    { label: 'Formulario Web', icon: '🌐' },
  open_house:  { label: 'Open House',    icon: '🏠' },
  manual:      { label: 'Reg. Manual',   icon: '✍️' },
  ads:         { label: 'Meta Ads',      icon: '📣' },
  referral:    { label: 'Referido',      icon: '🤝' },
}

export const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  es: { label: 'Español',   flag: '🇪🇸' },
  en: { label: 'English',   flag: '🇺🇸' },
  pt: { label: 'Português', flag: '🇧🇷' },
}
```

- [ ] **Step 2: Create `src/lib/db.ts`**

DB row shapes (snake_case) and mapper functions that convert them to the camelCase domain types in `types.ts`. The mappers let existing UI components work without field-name rewrites.

```ts
import type { Agent, Lead, LeadSource, LeadMagnet } from './types'

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string
  tenant_id: string
  name: string
  email: string
  phone: string | null
  language: string
  specialty: string
  avatar_initials: string
  accent_color: string
  active: boolean
  created_at: string
}

export interface LeadSourceRow {
  id: string
  tenant_id: string
  name: string
  type: string
  created_at: string
}

export interface LeadRow {
  id: string
  tenant_id: string
  agent_id: string
  source_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  language: string
  status: string
  temperature_score: number
  lender: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LeadMagnetRow {
  id: string
  tenant_id: string
  agent_id: string
  title: string
  subtitle: string
  language: string
  month_year: string
  cover_emoji: string
  page_url: string
  active: boolean
  created_at: string
  agents?: AgentRow | null
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function mapAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? undefined,
    language: r.language as Agent['language'],
    specialty: r.specialty as Agent['specialty'],
    avatarInitials: r.avatar_initials,
    accentColor: r.accent_color,
    active: r.active,
  }
}

export function mapSource(r: LeadSourceRow): LeadSource {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    type: r.type as LeadSource['type'],
  }
}

export function mapLead(r: LeadRow): Lead {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    sourceId: r.source_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone ?? undefined,
    language: r.language as Lead['language'],
    status: r.status as Lead['status'],
    temperatureScore: r.temperature_score,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapLeadMagnet(r: LeadMagnetRow): LeadMagnet {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    title: r.title,
    subtitle: r.subtitle,
    language: r.language as LeadMagnet['language'],
    monthYear: r.month_year,
    pageUrl: r.page_url,
    coverEmoji: r.cover_emoji,
    active: r.active,
  }
}
```

- [ ] **Step 3: Update `src/lib/types.ts`**

Add `UserProfile` and `LeadMagnet` types. Keep existing types (`Lead`, `Agent`, etc.) unchanged since the mappers produce them.

```ts
export type LeadStatus =
  | 'new' | 'nurturing' | 'warm' | 'hot'
  | 'process_started' | 'process_completed' | 'closed' | 'lost'

export type AgentSpecialty =
  | 'hispanic' | 'military' | 'first_buyer' | 'brazilian'

export type LeadSourceType =
  | 'lead_magnet' | 'web_form' | 'open_house' | 'manual' | 'ads' | 'referral'

export type Language = 'es' | 'en' | 'pt'

export interface Tenant {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor: string
}

export interface UserProfile {
  id: string
  tenantId: string | null
  role: 'super_admin' | 'agent_owner'
}

export interface Agent {
  id: string
  tenantId: string
  name: string
  email: string
  phone?: string
  language: Language
  specialty: AgentSpecialty
  avatarInitials: string
  accentColor: string
  active: boolean
}

export interface LeadSource {
  id: string
  tenantId: string
  name: string
  type: LeadSourceType
}

export interface LeadMagnet {
  id: string
  tenantId: string
  agentId: string
  title: string
  subtitle: string
  language: Language
  monthYear: string
  pageUrl: string
  coverEmoji: string
  active: boolean
}

export interface Lead {
  id: string
  tenantId: string
  agentId: string
  sourceId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  language: Language
  status: LeadStatus
  temperatureScore: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface LeadEvent {
  id: string
  leadId: string
  type: string
  description: string
  createdAt: string
}

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: number
}
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/lib/config.ts src/lib/db.ts src/lib/types.ts
git commit -m "feat: add UI config, DB row types, and domain mappers"
```

---

## Task 5: Create middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DASHBOARD_PATHS = ['/dashboard', '/leads', '/analytics', '/lead-magnets', '/settings']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isDashboard = DASHBOARD_PATHS.some(p => pathname.startsWith(p))

  if (isDashboard && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors. Middleware is picked up automatically by Next.js.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware for dashboard route protection"
```

---

## Task 6: Update login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Replace demo login with real Supabase auth**

Rewrite `src/app/(auth)/login/page.tsx` entirely. Keep the exact same visual design (dark card, CSS variables, gold CTA), replace the fake role-switcher with real email + password fields:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              letterSpacing: '0.08em',
              color: 'var(--accent-gold)',
              marginBottom: '6px',
            }}
          >
            ITMANO
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Growth Partner Platform
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="tu@email.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: '12px', color: '#E05C5C', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '11px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: loading ? 'var(--accent-gold-dim)' : 'var(--accent-gold)',
            color: '#0B0C0E',
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '0.06em',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          ITMANO CRM · A&amp;J Real Estate Group
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat: replace demo login with real Supabase auth"
```

---

## Task 7: Migrate dashboard/page.tsx

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

This is a Server Component. Replace every `mockdata` import with Supabase queries. The `recentActivity` array was always hardcoded in this file — leave it as-is.

- [ ] **Step 1: Replace imports and data fetching**

At the top of `dashboard/page.tsx`, replace the mockdata imports with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { mapAgent, mapLead, type LeadRow, type AgentRow } from '@/lib/db'
import { STATUS_CONFIG, SOURCE_CONFIG } from '@/lib/config'
import type { Agent } from '@/lib/types'
```

Replace the `export default function DashboardPage()` with `async`:

```tsx
export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: rawLeads }, { data: rawAgents }] = await Promise.all([
    supabase.from('leads').select('*, lead_sources(*)').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
  ])

  const leads = (rawLeads ?? []).map(r => mapLead(r as LeadRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
```

- [ ] **Step 2: Replace every `MOCK_LEADS` / `MOCK_AGENTS` reference**

Inside the function body, replace every occurrence of `MOCK_LEADS` with `leads` and `MOCK_AGENTS` with `agents`. Replace helper call sites:

| Old | New |
|---|---|
| `getLeadsStats()` | Compute inline: `{ total: leads.length, hot: leads.filter(l => l.status === 'hot' \|\| l.temperatureScore >= 70).length, inProcess: leads.filter(l => l.status === 'process_started').length, closed: leads.filter(l => l.status === 'closed' \|\| l.status === 'process_completed').length }` |
| `getAgentById(lead.agentId)` | `agents.find(a => a.id === lead.agentId)` |
| `getSourceById(lead.sourceId)` | Not needed — `lead_sources(*)` is already joined: access `(rawLeads[i] as any).lead_sources` if you need source type, or remove source label from the hot leads list for now |

The `SOURCE_CONFIG` reference in the hot leads row's subtitle can access the join result:

```tsx
// In the hotLeads map, source type from joined data:
const raw = rawLeads?.find(r => r.id === lead.id) as any
const sourceType = raw?.lead_sources?.type ?? 'manual'
const sourceLabel = SOURCE_CONFIG[sourceType]?.label ?? '—'
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: migrate dashboard page to Supabase"
```

---

## Task 8: Migrate analytics/page.tsx

**Files:**
- Modify: `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Replace imports and add async data fetch**

Replace the mockdata imports at the top:

```tsx
import { createClient } from '@/lib/supabase/server'
import { mapAgent, mapLead, mapSource, type AgentRow, type LeadRow, type LeadSourceRow } from '@/lib/db'
import { SOURCE_CONFIG } from '@/lib/config'
```

Change the function signature to `async` and add data fetching:

```tsx
export default async function AnalyticsPage() {
  const supabase = await createClient()

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawSources }] = await Promise.all([
    supabase.from('leads').select('*, lead_sources(type)'),
    supabase.from('agents').select('*'),
    supabase.from('lead_sources').select('*'),
  ])

  const leads  = (rawLeads  ?? []).map(r => mapLead(r as LeadRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  const sources = (rawSources ?? []).map(r => mapSource(r as LeadSourceRow))
```

- [ ] **Step 2: Replace `MOCK_LEADS` / `MOCK_AGENTS` / `MOCK_SOURCES` references**

Replace every occurrence:
- `MOCK_LEADS` → `leads`
- `MOCK_AGENTS` → `agents`
- `MOCK_SOURCES` → `sources`

For the source type lookup in `sourceCounts`:
```tsx
// Old:
const source = MOCK_SOURCES.find(s => s.id === lead.sourceId)
const type = source?.type ?? 'manual'

// New (use join result from rawLeads, or fall back):
const raw = rawLeads?.find(r => r.id === lead.id) as any
const type = raw?.lead_sources?.type ?? 'manual'
```

For `agentData`, replace `agent.accentColor` → `agent.accentColor` (mapAgent already handles this).

The `enrichedMonthlyData` array is hardcoded — leave it unchanged.

Handle the empty DB case (division by zero guard):

```tsx
// Old:
const conversionRate = Math.round((closedLeads / totalLeads) * 100)
const avgScore = Math.round(MOCK_LEADS.reduce(...) / totalLeads)

// New:
const conversionRate = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 100) : 0
const avgScore = totalLeads > 0
  ? Math.round(leads.reduce((sum, l) => sum + l.temperatureScore, 0) / totalLeads)
  : 0
```

For `tempByAgent`, add a division-by-zero guard:
```tsx
const avgTemp = leads.length > 0
  ? Math.round(leads.reduce((s, l) => s + l.temperatureScore, 0) / leads.length)
  : 0
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/analytics/page.tsx
git commit -m "feat: migrate analytics page to Supabase"
```

---

## Task 9: Migrate lead-magnets/page.tsx

**Files:**
- Modify: `src/app/(dashboard)/lead-magnets/page.tsx`

The `lead_magnets` table has no `stats` column — stats were fake in Phase 1. In Phase 2 the cards show 0 for all stats (the DB is empty initially). The `downloadUrl` field is replaced by `pageUrl`.

- [ ] **Step 1: Replace imports**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { mapLeadMagnet, mapAgent, type LeadMagnetRow, type AgentRow } from '@/lib/db'
import type { LeadMagnet, Agent } from '@/lib/types'
import { LMTabs } from './lm-tabs'
import { Download, Users, TrendingUp } from 'lucide-react'
```

- [ ] **Step 2: Update the `LMCard` component**

Replace `lm.stats.*` references with zeros, `lm.coverEmoji` → `lm.coverEmoji`, `lm.agentId` → `lm.agentId`, `lm.monthYear` → `lm.monthYear`, `lm.downloadUrl` → `lm.pageUrl`. The `agent` is now passed as a separate prop fetched alongside the LM:

```tsx
function LMCard({ lm, agent }: { lm: LeadMagnet; agent: Agent }) {
  const stats = { totalDownloads: 0, leadsGenerated: 0, conversionRate: 0, openRate: 0, avgTemperature: 0 }

  return (
    <div
      className="lm-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        overflow: 'hidden',
        borderTop: `3px solid ${agent.accentColor}`,
        transition: 'border-color 0.2s',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Card header */}
      <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>{lm.coverEmoji}</span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--accent-green)', background: 'rgba(107,163,104,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Activo
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: agent.accentColor }}>
            {agent.avatarInitials}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agent.name.split(' ')[0]}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px', flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{lm.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{lm.subtitle}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {lm.monthYear} · {lm.language === 'es' ? '🇪🇸' : lm.language === 'en' ? '🇺🇸' : '🇧🇷'}
        </div>

        {/* Stats 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', margin: '0 0 12px' }}>
          {[
            { value: stats.totalDownloads, label: 'Descargas' },
            { value: stats.leadsGenerated, label: 'Leads gen.' },
            { value: `${stats.conversionRate}%`, label: 'Conversión' },
            { value: `${stats.openRate}%`, label: 'Open rate' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Temperature bar */}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Temp. promedio de leads:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg-overlay)' }}>
            <div style={{ width: `${stats.avgTemperature}%`, height: '100%', borderRadius: '2px', background: '#C9A96E' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '22px', textAlign: 'right' }}>{stats.avgTemperature}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/leads" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
          Ver leads →
        </Link>
        <a
          href={lm.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px 10px' }}
        >
          <Download size={12} />
          Ver guía
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `HistoryView` and `LeadMagnetsPage`**

Update `HistoryView` to accept `lms` and `agents` as props (no mockdata):

```tsx
function HistoryView({ lms, agents }: { lms: LeadMagnet[]; agents: Agent[] }) {
  const historyLMs = lms.filter(lm => !lm.active)
  const groupedByAgent = agents.map(agent => ({
    agent,
    magnets: historyLMs.filter(lm => lm.agentId === agent.id),
  })).filter(g => g.magnets.length > 0)

  return (
    <div>
      {groupedByAgent.map(({ agent, magnets }) => (
        <div key={agent.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', borderLeft: `3px solid ${agent.accentColor}` }}>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: agent.accentColor }}>
              {agent.avatarInitials}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</span>
          </div>
          {magnets.map((lm, i) => (
            <div key={lm.id} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{lm.coverEmoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>
                  {lm.title}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>· {lm.monthYear}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>0 descargas · 0 leads · 0% conv. · 0% open</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Link href="/leads" style={{ fontSize: '11px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>Ver leads →</Link>
                <a href={lm.pageUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '4px 8px' }}>
                  <Download size={11} />
                  Ver guía
                </a>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

Update `LeadMagnetsPage` to be `async` and fetch from Supabase:

```tsx
export default async function LeadMagnetsPage() {
  const supabase = await createClient()

  const [{ data: rawLMs }, { data: rawAgents }] = await Promise.all([
    supabase.from('lead_magnets').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
  ])

  const lms    = (rawLMs    ?? []).map(r => mapLeadMagnet(r as LeadMagnetRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  const activeLMs = lms.filter(lm => lm.active)

  const globalStats = {
    totalDownloads: 0,
    totalLeads:     activeLMs.length > 0 ? 0 : 0,
    avgConversion:  0,
  }

  const kpis = [
    { label: 'Descargas este mes', value: String(globalStats.totalDownloads), icon: <Download size={18} />, color: 'var(--accent-gold)' },
    { label: 'Leads generados',    value: String(globalStats.totalLeads),     icon: <Users size={18} />,    color: '#5B8EC9' },
    { label: 'Conversión promedio', value: `${globalStats.avgConversion}%`,   icon: <TrendingUp size={18} />, color: 'var(--accent-green)' },
  ]

  const activeContent = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {activeLMs.map(lm => {
        const agent = agents.find(a => a.id === lm.agentId)
        if (!agent) return null
        return <LMCard key={lm.id} lm={lm} agent={agent} />
      })}
    </div>
  )

  const historyContent = <HistoryView lms={lms} agents={agents} />

  return (
    <>
      <style>{`.lm-card:hover { border-color: var(--border-accent) !important; }`}</style>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Lead Magnets</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Material gratuito activo · Lead Magnets</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(201,169,110,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>{kpi.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <LMTabs activeContent={activeContent} historyContent={historyContent} />
    </>
  )
}
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/lead-magnets/page.tsx
git commit -m "feat: migrate lead-magnets page to Supabase"
```

---

## Task 10: Migrate leads/page.tsx (Server wrapper + Client split)

**Files:**
- Create: `src/app/(dashboard)/leads/leads-client.tsx`
- Modify: `src/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Rename current leads/page.tsx to leads-client.tsx**

Copy the entire current content of `leads/page.tsx` to `leads/leads-client.tsx`. Then update the imports at the top of `leads-client.tsx`:

Replace:
```tsx
import {
  MOCK_LEADS, MOCK_AGENTS, STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG,
  getAgentById, getSourceById,
} from '@/lib/mockdata'
```

With:
```tsx
import { STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource } from '@/lib/types'
```

Add props to the exported component (rename it from `export default function LeadsPage` to `export function LeadsClient`):

```tsx
interface LeadsClientProps {
  leads: Lead[]
  agents: Agent[]
  sources: LeadSource[]
}

export function LeadsClient({ leads, agents, sources }: LeadsClientProps) {
```

Inside the component, replace `MOCK_LEADS` → `leads`, `MOCK_AGENTS` → `agents`. Replace helper calls:
- `getAgentById(lead.agentId)` → `agents.find(a => a.id === lead.agentId)`
- `getSourceById(lead.sourceId)` → `sources.find(s => s.id === lead.sourceId)`

- [ ] **Step 2: Rewrite leads/page.tsx as a thin Server Component**

Replace the entire content of `src/app/(dashboard)/leads/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { mapAgent, mapLead, mapSource, type AgentRow, type LeadRow, type LeadSourceRow } from '@/lib/db'
import { LeadsClient } from './leads-client'

export default async function LeadsPage() {
  const supabase = await createClient()

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawSources }] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
    supabase.from('lead_sources').select('*'),
  ])

  return (
    <LeadsClient
      leads={(rawLeads ?? []).map(r => mapLead(r as LeadRow))}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      sources={(rawSources ?? []).map(r => mapSource(r as LeadSourceRow))}
    />
  )
}
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/leads/leads-client.tsx src/app/\(dashboard\)/leads/page.tsx
git commit -m "feat: migrate leads page to Supabase (server wrapper + client split)"
```

---

## Task 11: Migrate leads/[id]/page.tsx (Server wrapper + Client split)

**Files:**
- Create: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`
- Modify: `src/app/(dashboard)/leads/[id]/page.tsx`

- [ ] **Step 1: Create leads/[id]/lead-detail-client.tsx**

Copy the current entire content of `leads/[id]/page.tsx` to `lead-detail-client.tsx`. Make these changes:

Replace imports:
```tsx
import { STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource, LeadEvent } from '@/lib/types'
```

Remove `useParams` — the component will receive `lead`, `agent`, `source`, `events` as props.

Change the exported function signature:

```tsx
interface LeadDetailProps {
  lead: Lead
  agent: Agent | undefined
  source: LeadSource | undefined
  events: LeadEvent[]
}

export function LeadDetailClient({ lead, agent, source, events }: LeadDetailProps) {
```

Remove the `useParams` call and the `MOCK_LEADS.find(...)` lines. Replace with direct use of the `lead` prop.

Also replace `getAgentById(lead.agentId)` → `agent`, `getSourceById(lead.sourceId)` → `source`.

The `MOCK_EVENTS` array in the current file is hardcoded — leave it as the default value for `events` if the prop is empty:

```tsx
// At the top of the component, if events is empty, fall back to the static list:
const displayEvents: TimelineEvent[] = events.length > 0
  ? events.map(e => ({ id: e.id, type: e.type, icon: 'Circle', color: '#C9A96E', description: e.description, date: e.createdAt }))
  : STATIC_EVENTS  // rename the current MOCK_EVENTS constant to STATIC_EVENTS
```

- [ ] **Step 2: Rewrite leads/[id]/page.tsx as a thin Server Component**

```tsx
import { createClient } from '@/lib/supabase/server'
import { mapAgent, mapLead, mapSource, type AgentRow, type LeadRow, type LeadSourceRow } from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: rawLead }, { data: rawAgents }, { data: rawSources }, { data: rawEvents }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_sources').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
  ])

  if (!rawLead) notFound()

  const lead    = mapLead(rawLead as LeadRow)
  const agents  = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const sources = (rawSources ?? []).map(r => mapSource(r as LeadSourceRow))
  const events  = (rawEvents  ?? []).map(r => ({
    id:          r.id as string,
    leadId:      r.lead_id as string,
    type:        r.type as string,
    description: r.description as string,
    createdAt:   r.created_at as string,
  }))

  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      source={sources.find(s => s.id === lead.sourceId)}
      events={events}
    />
  )
}
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/leads/\[id\]/lead-detail-client.tsx src/app/\(dashboard\)/leads/\[id\]/page.tsx
git commit -m "feat: migrate lead detail page to Supabase (server wrapper + client split)"
```

---

## Task 12: Migrate leads/new/page.tsx (Server wrapper + Server Action)

**Files:**
- Create: `src/app/(dashboard)/leads/new/new-lead-client.tsx`
- Create: `src/app/(dashboard)/leads/new/actions.ts`
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Create new-lead-client.tsx**

Copy the current content of `leads/new/page.tsx` to `new-lead-client.tsx`. Update the top:

Replace:
```tsx
import { MOCK_AGENTS } from '@/lib/mockdata'
```

With:
```tsx
import type { Agent } from '@/lib/types'
import { createLead, createLeadsBulk } from './actions'
```

Change the exported function to accept agents as a prop:

```tsx
export function NewLeadClient({ agents }: { agents: Agent[] }) {
```

In the form submission logic (the `handleManualSubmit` function), replace the fake success simulation with a real Server Action call:

```tsx
async function handleManualSubmit() {
  // ... existing validation ...
  setIsSubmitting(true)
  const result = await createLead({
    firstName:  formData.firstName,
    lastName:   formData.lastName,
    email:      formData.email,
    phone:      formData.phone || null,
    language:   formData.language as Language,
    agentId:    formData.agentId,
    sourceType: formData.sourceType,
    lender:     formData.lender || null,
    notes:      formData.notes || null,
  })
  setIsSubmitting(false)
  if (result.error) {
    setErrors({ firstName: result.error })
  } else {
    setSubmitSuccess(true)
  }
}
```

For the bulk CSV import submission (`handleImport`), replace the fake success with:

```tsx
async function handleImport() {
  if (validRows.length === 0) return
  setImportStatus('parsing')
  const result = await createLeadsBulk(validRows.map(row => ({
    firstName:  row.firstName,
    lastName:   row.lastName,
    email:      row.email,
    phone:      row.phone || null,
    language:   row.language as Language,
    agentId:    row.agentId,
    sourceType: row.sourceType,
    lender:     row.lender || null,
    notes:      row.notes || null,
  })))
  if (result.error) {
    setImportStatus('error')
    setImportError(result.error)
  } else {
    setImportStatus('success')
  }
}
```

- [ ] **Step 2: Create `actions.ts`**

Create `src/app/(dashboard)/leads/new/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { Language } from '@/lib/types'

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface LeadInput {
  firstName:  string
  lastName:   string
  email:      string
  phone:      string | null
  language:   Language
  agentId:    string
  sourceType: string
  lender:     string | null
  notes:      string | null
}

async function getOrCreateSource(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, type: string) {
  const { data: existing } = await supabase
    .from('lead_sources')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', type)
    .limit(1)
    .single()

  if (existing) return existing.id

  const sourceLabels: Record<string, string> = {
    lead_magnet: 'Lead Magnet', web_form: 'Formulario Web', open_house: 'Open House',
    manual: 'Registro Manual', ads: 'Meta Ads', referral: 'Referido',
  }

  const newId = genId('src')
  await supabase.from('lead_sources').insert({
    id: genId('src'), tenant_id: tenantId, name: sourceLabels[type] ?? type, type,
  })
  return newId
}

export async function createLead(input: LeadInput): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .single()

  if (!profile?.tenant_id) return { error: 'No tenant found for current user' }

  const tenantId = profile.tenant_id
  const sourceId = await getOrCreateSource(supabase, tenantId, input.sourceType)

  const { error } = await supabase.from('leads').insert({
    id:                genId('lead'),
    tenant_id:         tenantId,
    agent_id:          input.agentId,
    source_id:         sourceId,
    first_name:        input.firstName,
    last_name:         input.lastName,
    email:             input.email,
    phone:             input.phone,
    language:          input.language,
    status:            'new',
    temperature_score: 0,
    lender:            input.lender,
    notes:             input.notes,
  })

  if (error) return { error: error.message }
  return {}
}

export async function createLeadsBulk(inputs: LeadInput[]): Promise<{ error?: string }> {
  if (inputs.length === 0) return {}

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .single()

  if (!profile?.tenant_id) return { error: 'No tenant found for current user' }

  const tenantId = profile.tenant_id

  const sourceTypeIds: Record<string, string> = {}
  for (const type of [...new Set(inputs.map(i => i.sourceType))]) {
    sourceTypeIds[type] = await getOrCreateSource(supabase, tenantId, type)
  }

  const rows = inputs.map(input => ({
    id:                genId('lead'),
    tenant_id:         tenantId,
    agent_id:          input.agentId,
    source_id:         sourceTypeIds[input.sourceType],
    first_name:        input.firstName,
    last_name:         input.lastName,
    email:             input.email,
    phone:             input.phone,
    language:          input.language,
    status:            'new',
    temperature_score: 0,
    lender:            input.lender,
    notes:             input.notes,
  }))

  const { error } = await supabase.from('leads').insert(rows)
  if (error) return { error: error.message }
  return {}
}
```

- [ ] **Step 3: Rewrite leads/new/page.tsx as a thin Server Component**

```tsx
import { createClient } from '@/lib/supabase/server'
import { mapAgent, type AgentRow } from '@/lib/db'
import { NewLeadClient } from './new-lead-client'

export default async function NewLeadPage() {
  const supabase = await createClient()
  const { data: rawAgents } = await supabase.from('agents').select('*').eq('active', true)
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  return <NewLeadClient agents={agents} />
}
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/app/\(dashboard\)/leads/new/
git commit -m "feat: migrate new lead page to Supabase with Server Actions"
```

---

## Task 13: Delete mockdata.ts and final cleanup

**Files:**
- Delete: `src/lib/mockdata.ts`
- Verify all imports are resolved

- [ ] **Step 1: Delete mockdata.ts**

```bash
git rm src/lib/mockdata.ts
```

- [ ] **Step 2: Check for remaining mockdata imports**

```bash
npm run build 2>&1 | grep mockdata
```

Expected: no output (zero remaining imports). If any appear, update those files to import from `@/lib/config` or `@/lib/db` as appropriate.

- [ ] **Step 3: Final build verification**

```bash
npm run build
npm run lint
```

Expected: zero errors, zero warnings about mockdata.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: delete mockdata.ts — Phase 2 Auth + DB complete"
```

---

## Notes for the implementer

- **Supabase project must have RLS enabled** (it is by default, but confirm in Settings → Database → Row Level Security).
- **First user setup:** After deploying, create the first `agent_owner` manually in the Supabase Auth dashboard (Authentication → Users → Invite User), then insert a row in `user_profiles`: `{ id: '<uuid-from-auth>', tenant_id: 'aj-real-estate', role: 'agent_owner' }` using the Table Editor.
- **Empty DB:** All dashboard pages will render correctly with empty state (0 counts, empty lists) since `?? []` guards are in place.
- **ID generation:** `actions.ts` uses `genId()` (timestamp + Math.random) — no extra packages required. Collision risk is negligible at Phase 2 scale.
