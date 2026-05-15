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
  agent_id    text        not null references agents(id) on delete cascade,
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
  agent_id          text        not null references agents(id) on delete cascade,
  source_id         text        not null references lead_sources(id) on delete cascade,
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

-- ─── Triggers ───────────────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index idx_agents_tenant_id on agents(tenant_id);
create index idx_lead_sources_tenant_id on lead_sources(tenant_id);
create index idx_lead_magnets_tenant_id on lead_magnets(tenant_id);
create index idx_lead_magnets_agent_id on lead_magnets(agent_id);
create index idx_leads_tenant_id on leads(tenant_id);
create index idx_leads_agent_id on leads(agent_id);
create index idx_leads_source_id on leads(source_id);
create index idx_leads_status on leads(status);
create index idx_lead_events_lead_id on lead_events(lead_id);
create index idx_lead_events_tenant_id on lead_events(tenant_id);
