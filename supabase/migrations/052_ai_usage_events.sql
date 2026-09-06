-- 052 · Registro de uso de IA (tokens + costo USD) por tenant.
--
-- Una fila por request a la Claude API desde el CRM. Se escribe best-effort
-- desde los server actions que generan contenido con IA (propiedades, correos,
-- secuencias) vía service role; el costo se calcula al insertar con la tabla
-- de precios por modelo en src/lib/services/ai-usage.ts.
--
-- Lectura: Configuración → "Uso de IA" (tenant) y Centro de control (global).

create table if not exists ai_usage_events (
  id                    uuid        primary key default gen_random_uuid(),
  -- Nullable: super_admin operando sin tenant seleccionado (p. ej. correos de
  -- compra desde el hub). on delete set null conserva el histórico de costos.
  tenant_id             text        references tenants(id) on delete set null,
  user_id               uuid,
  -- 'property_intake' | 'email_draft' | 'sequence_bootstrap' (texto libre para
  -- no migrar por cada feature nueva)
  feature               text        not null,
  model                 text        not null,
  input_tokens          integer     not null default 0,
  output_tokens         integer     not null default 0,
  cache_read_tokens     integer     not null default 0,
  cache_creation_tokens integer     not null default 0,
  cost_usd              numeric(12, 6) not null default 0,
  metadata              jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_ai_usage_tenant_created
  on ai_usage_events (tenant_id, created_at desc);

create index if not exists idx_ai_usage_created
  on ai_usage_events (created_at desc);

-- RLS: lectura scoped por tenant (mismo patrón que email_sends); escrituras
-- solo vía service role (sin políticas de insert/update/delete).
alter table ai_usage_events enable row level security;

create policy "ai_usage_events_select"
  on ai_usage_events for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());
