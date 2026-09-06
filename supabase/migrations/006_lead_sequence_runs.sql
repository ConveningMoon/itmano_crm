-- Migration 006: lead_sequence_runs
--
-- RECONSTRUIDA. El archivo original nunca llegó al repositorio: producción tiene
-- la migración aplicada (supabase_migrations.schema_migrations, version
-- 20260518085618, 18-may-2026) pero supabase/migrations/ saltaba del 005 al 007.
-- Sin este archivo el esquema NO se puede reconstruir desde cero: la 014 falla
-- con "relation lead_sequence_runs does not exist".
--
-- El contenido se reconstruyó leyendo el esquema vivo de producción (columnas,
-- constraints, índices y policies) el 12-ago-2026. La lista de valores del check
-- de cancelled_reason es aproximada: la 023, la 039 y la 050 lo reemplazan por
-- completo, así que el estado final coincide con producción de todos modos.
--
-- Una corrida es la inscripción de un lead en una secuencia de email: guarda por
-- dónde va (current_step_order), cuándo toca el siguiente envío (next_send_at) y
-- por qué se detuvo (cancelled_reason). La lee el orquestador horario.

create table if not exists lead_sequence_runs (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           text        not null,
  lead_id             text        not null references leads(id) on delete cascade,
  sequence_id         uuid        not null references email_sequences(id) on delete cascade,
  current_step_order  integer     not null default 0,
  next_send_at        timestamptz,
  status              text        not null default 'active',
  cancelled_reason    text,
  started_at          timestamptz not null default now(),
  last_sent_at        timestamptz,
  completed_at        timestamptz,

  constraint lead_sequence_runs_status_check
    check (status = any (array['active', 'paused', 'completed', 'cancelled'])),

  constraint lead_sequence_runs_cancelled_reason_check
    check (
      cancelled_reason is null or
      cancelled_reason = any (array[
        'unsubscribed', 'replied', 'lead_closed', 'manual', 'sequence_deleted'
      ])
    )
);

-- Un lead no puede tener dos corridas activas de la misma secuencia. El índice
-- parcial deja reinscribir tras cancelar o completar, que es el caso real.
create unique index if not exists lead_sequence_runs_active_uq
  on lead_sequence_runs (lead_id, sequence_id) where (status = 'active');

-- El orquestador barre por next_send_at entre las corridas activas.
create index if not exists lead_sequence_runs_next_send_at_idx
  on lead_sequence_runs (next_send_at) where (status = 'active');

create index if not exists lead_sequence_runs_lead_id_idx
  on lead_sequence_runs (lead_id);

create index if not exists lead_sequence_runs_tenant_id_idx
  on lead_sequence_runs (tenant_id);

alter table lead_sequence_runs enable row level security;

create policy "tenant isolation: lead_sequence_runs" on lead_sequence_runs
  for all using (tenant_id = get_my_tenant_id());

create policy "super_admin: lead_sequence_runs" on lead_sequence_runs
  for all using (is_super_admin());
