-- ─── Email Sequences ──────────────────────────────────────────────────────────

create table email_sequences (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              text        not null references tenants(id),
  acquisition_channel_id uuid        not null unique references acquisition_channels(id) on delete cascade,
  name                   text        not null,
  active                 boolean     not null default true,
  created_at             timestamptz not null default now()
);

-- ─── Email Sequence Steps ─────────────────────────────────────────────────────

create table email_sequence_steps (
  id          uuid        primary key default gen_random_uuid(),
  sequence_id uuid        not null references email_sequences(id) on delete cascade,
  tenant_id   text        not null references tenants(id),
  step_order  integer     not null,
  delay_hours integer     not null default 0,
  subject     text        not null,
  body_html   text        not null default '',
  active      boolean     not null default true,
  constraint email_sequence_steps_step_order_positive check (step_order >= 0)
);

create index idx_email_sequence_steps_sequence
  on email_sequence_steps(sequence_id, step_order asc);

-- ─── Back-reference: acquisition_channels.email_sequence_id → email_sequences ─

alter table acquisition_channels
  add constraint acquisition_channels_email_sequence_id_fkey
  foreign key (email_sequence_id) references email_sequences(id) on delete set null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table email_sequences       enable row level security;
alter table email_sequence_steps  enable row level security;

create policy "email_sequences_select" on email_sequences
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequences_insert" on email_sequences
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequences_update" on email_sequences
  for update using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequences_delete" on email_sequences
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequence_steps_select" on email_sequence_steps
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequence_steps_insert" on email_sequence_steps
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequence_steps_update" on email_sequence_steps
  for update using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "email_sequence_steps_delete" on email_sequence_steps
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());
