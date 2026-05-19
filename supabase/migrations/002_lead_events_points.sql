-- Add points delta to events (nullable — system events like lead_created have no points)
alter table lead_events add column points integer;

-- Allow NULL score for terminal leads (closed/lost)
alter table leads alter column temperature_score drop not null;

-- Purchase process details (one row per process_started lead)
create table purchase_processes (
  id           uuid        primary key default gen_random_uuid(),
  lead_id      text        not null references leads(id) on delete cascade,
  tenant_id    text        not null references tenants(id),
  address      text        not null,
  loan_type    text        not null,
  closing_date date,
  notes        text,
  created_at   timestamptz default now()
);

alter table purchase_processes enable row level security;

create policy "purchase_processes_select" on purchase_processes
  for select using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "purchase_processes_insert" on purchase_processes
  for insert with check (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "purchase_processes_update" on purchase_processes
  for update using (is_super_admin() or tenant_id = get_my_tenant_id());

create policy "purchase_processes_delete" on purchase_processes
  for delete using (is_super_admin() or tenant_id = get_my_tenant_id());

create index idx_purchase_processes_lead_id on purchase_processes(lead_id);
create index idx_purchase_processes_tenant_id on purchase_processes(tenant_id);
