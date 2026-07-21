-- 068 · Log/ledger completo del proceso de creación de carruseles.
--
-- Doble propósito:
--   1. DIAGNÓSTICO — cada paso (start/research/copy/image/compose/upload/render)
--      registra una fila con nivel (info/warn/error), mensaje y `detail` jsonb.
--      Así se puede leer el proceso completo de un job (incl. el error exacto)
--      sin tener que regenerar y desperdiciar tokens.
--   2. COSTOS — los pasos de generación (copy/research/image) guardan también
--      provider/model/billing/cost_usd/tokens. Como CADA generación (incluida una
--      regeneración de imagen) inserta su fila, el costo real por regeneración sí
--      queda registrado (a diferencia de contar slides finales).
--
-- Cae por ON DELETE CASCADE al borrar el job. RLS: solo super_admin lee.
create table if not exists carousel_logs (
  id            uuid        primary key default gen_random_uuid(),
  job_id        uuid        not null references carousel_jobs(id) on delete cascade,
  slide_number  int,
  level         text        not null default 'info' check (level in ('info','warn','error')),
  step          text        not null check (step in ('start','research','copy','image','compose','upload','render','delete')),
  message       text        not null,
  -- Costo (solo pasos de generación): copy = real (Claude); research/image = estimado (Google).
  provider      text,
  model         text,
  billing       text        check (billing in ('real','estimado')),
  cost_usd      numeric(12,6),
  input_tokens  int,
  output_tokens int,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_carousel_logs_job on carousel_logs (job_id, created_at);
create index if not exists idx_carousel_logs_cost on carousel_logs (job_id, step) where cost_usd is not null;

alter table carousel_logs enable row level security;
create policy "carousel_logs_select" on carousel_logs for select using (is_super_admin());
