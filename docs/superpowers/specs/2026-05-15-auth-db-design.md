# Auth + DB Design — Phase 2

**Date:** 2026-05-15  
**Scope:** Supabase Auth + PostgreSQL schema + RLS for itmano-crm  
**Status:** Approved

---

## Context

itmano-crm is a multi-tenant SaaS CRM for real estate teams. Phase 1 delivered a fully functional static UI backed by `mockdata.ts`. Phase 2 replaces the static data layer with a real Supabase backend.

This spec covers the first subsystem of Phase 2: **Auth + DB**. Realtime and notification Edge Functions are out of scope.

---

## Roles

| Role | Description |
|---|---|
| `super_admin` | SaaS owner. Single account. Sees and manages all tenants. `tenant_id = null` in `user_profiles`. Uses `service_role` for admin operations. |
| `agent_owner` | Real estate agency owner. One account per tenant. Sees only their own tenant's data. RLS enforces isolation. |

Agents (Adriana, John, Melanie, Viviane) are **data records only** — they do not have login accounts.

---

## Auth Flow

1. User navigates to `/login`
2. Submits email + password
3. Supabase Auth validates credentials
4. On success: query `user_profiles` for `role` and `tenant_id`
5. Redirect to `/dashboard` (RLS handles data isolation automatically)

Tenant identification is **email-based** — no subdomains or URL slugs. The tenant is resolved from `user_profiles.tenant_id` after login.

Creating a new `agent_owner` is a manual `super_admin` operation in Phase 2: create the user in Supabase Auth dashboard, then insert a row in `user_profiles`. No onboarding UI in this phase.

---

## Database Schema

Six tables. All tables except `tenants` and `user_profiles` have `tenant_id text not null references tenants(id)` for RLS isolation. IDs for `tenants`, `agents`, `lead_sources`, and `leads` are `text` slugs. `lead_events` uses `uuid`.

```sql
-- 1. tenants
create table tenants (
  id            text        primary key,
  name          text        not null,
  slug          text        unique not null,
  logo_url      text,
  primary_color text        not null default '#1E3A5F',
  created_at    timestamptz default now()
);

-- 2. user_profiles (links auth.users → tenant + role)
create table user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  text references tenants(id),  -- null for super_admin
  role       text not null check (role in ('super_admin', 'agent_owner')),
  created_at timestamptz default now()
);

-- 3. agents
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

-- 4. lead_sources
create table lead_sources (
  id         text        primary key,
  tenant_id  text        not null references tenants(id),
  name       text        not null,
  type       text        not null check (type in ('lead_magnet', 'web_form', 'open_house', 'manual', 'ads', 'referral')),
  created_at timestamptz default now()
);

-- 5. leads
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

-- 6. lead_events
create table lead_events (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     text        not null references leads(id) on delete cascade,
  tenant_id   text        not null references tenants(id),
  type        text        not null,
  description text        not null,
  created_at  timestamptz default now()
);
```

---

## RLS Strategy

Approach: **`user_profiles` table + security definer helper functions**.

### Helper Functions

```sql
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
```

### Policy Pattern (applied to `agents`, `lead_sources`, `leads`, `lead_events`)

```sql
-- SELECT: super_admin sees all; agent_owner sees own tenant
create policy "tenant_select" on <table>
  for select using (
    is_super_admin() or tenant_id = get_my_tenant_id()
  );

-- INSERT / UPDATE / DELETE: agent_owner only within own tenant
create policy "tenant_insert" on <table>
  for insert with check (tenant_id = get_my_tenant_id());

create policy "tenant_update" on <table>
  for update using (tenant_id = get_my_tenant_id());

create policy "tenant_delete" on <table>
  for delete using (tenant_id = get_my_tenant_id());
```

### `user_profiles` Policies

```sql
-- Own profile always readable; super_admin can read all
create policy "user_profiles_select" on user_profiles
  for select using (id = auth.uid() or is_super_admin());
```

### `tenants` Policies

```sql
-- super_admin: full access
-- agent_owner: read their own tenant row only
create policy "tenant_row_select" on tenants
  for select using (
    is_super_admin() or id = get_my_tenant_id()
  );
```

Admin operations (creating tenants, assigning users) use `service_role` key from Server Actions only — never exposed to the browser.

---

## Next.js Integration

### Packages

```
@supabase/supabase-js
@supabase/ssr
```

### New Files

| File | Purpose |
|---|---|
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `src/lib/supabase/client.ts` | Browser client for Client Components |
| `src/lib/supabase/server.ts` | SSR client (cookies) for Server Components and Server Actions |
| `src/middleware.ts` | Session refresh on every request + auth guard for `(dashboard)` routes |
| `supabase/migrations/001_initial_schema.sql` | Full schema + RLS policies |

### Modified Files

| File | Change |
|---|---|
| `src/app/(auth)/login/page.tsx` | Real Supabase email+password auth |
| `src/app/(dashboard)/layout.tsx` | Read session server-side, pass user as prop to children |
| `src/app/(dashboard)/dashboard/page.tsx` | Replace mockdata with Supabase queries |
| `src/app/(dashboard)/leads/page.tsx` | Replace mockdata with Supabase queries |
| `src/app/(dashboard)/leads/[id]/page.tsx` | Replace mockdata with Supabase queries |
| `src/app/(dashboard)/leads/new/page.tsx` | Write new leads to Supabase |
| `src/app/(dashboard)/analytics/page.tsx` | Replace mockdata with Supabase queries |
| `src/app/(dashboard)/lead-magnets/page.tsx` | Replace mockdata with Supabase queries |
| `src/app/(dashboard)/settings/page.tsx` | Replace mockdata with Supabase queries |
| `src/lib/types.ts` | Add `UserProfile` type |
| `src/lib/mockdata.ts` | **Deleted** |

### Data Fetching Pattern

Server Components query Supabase directly with `await`. RLS applies automatically via the user's session cookie.

```ts
// Example: leads/page.tsx (Server Component)
import { createServerClient } from '@/lib/supabase/server'

export default async function LeadsPage() {
  const supabase = await createServerClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('*, agents(*), lead_sources(*)')
    .order('created_at', { ascending: false })
  // ...
}
```

Helper functions from `mockdata.ts` (`getLeadsStats`, `getAgentById`, etc.) are replaced by inline Supabase queries at the call site.

### Middleware Behavior

```
(funnel)/*        → public, no auth check
(auth)/login      → public, redirect to /dashboard if already authenticated
(dashboard)/*     → protected, redirect to /login if no session
```

---

## Out of Scope (Phase 2 later subsystems)

- Supabase Realtime subscriptions
- Email notifications (Resend)
- WhatsApp notifications (Meta Cloud API)
- Agent invitation / onboarding UI
- Subdomain-based tenant routing
