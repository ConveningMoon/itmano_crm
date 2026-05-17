-- ─── Acquisition Channels ────────────────────────────────────────────────────

create table acquisition_channels (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         text        not null references tenants(id),
  public_id         text        not null unique,
  channel_type      text        not null,
  name              text        not null,
  slug              text        not null,
  active            boolean     not null default true,
  email_sequence_id uuid,      -- FK to email_sequences added in migration 004
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz,

  constraint acquisition_channels_public_id_format
    check (public_id ~ '^chn_[a-z0-9]{12}$'),
  constraint acquisition_channels_channel_type_valid
    check (channel_type in ('lead_magnet','event','contact_form','manychat_flow','manual')),
  constraint acquisition_channels_tenant_slug_unique
    unique (tenant_id, slug)
);

-- ─── Channel Page Views ───────────────────────────────────────────────────────

create table channel_page_views (
  id                  uuid        primary key default gen_random_uuid(),
  channel_id          uuid        not null references acquisition_channels(id) on delete cascade,
  tenant_id           text        not null references tenants(id),
  visitor_fingerprint text        not null,
  traffic_source      text,
  utm_data            jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index idx_channel_page_views_channel_created
  on channel_page_views(channel_id, created_at desc);

create index idx_channel_page_views_tenant_created
  on channel_page_views(tenant_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table acquisition_channels  enable row level security;
alter table channel_page_views    enable row level security;

create policy "acquisition_channels_select" on acquisition_channels
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "acquisition_channels_insert" on acquisition_channels
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "acquisition_channels_update" on acquisition_channels
  for update using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "acquisition_channels_delete" on acquisition_channels
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "channel_page_views_select" on channel_page_views
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "channel_page_views_insert" on channel_page_views
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "channel_page_views_delete" on channel_page_views
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());
