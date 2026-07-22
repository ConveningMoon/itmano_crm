-- 069 · Log de briefings de IA por lead (cerrar el loop del análisis de fit).
--
-- El análisis de fit con IA (064) ya no solo clasifica: produce un BRIEFING
-- accionable (lectura + próxima acción + premura + puntos + riesgo) que se guarda
-- en leads.metadata.ai_fit para mostrar el ÚLTIMO en la ficha del lead. Pero ese
-- campo se sobrescribe en cada análisis, así que no deja medir nada en el tiempo.
--
-- Esta tabla es un LOG append-only de cada briefing, con un snapshot del estado
-- del lead al momento (status + score). Con eso el centro de control mide el loop:
-- de los leads donde el agente ACTUÓ tras la recomendación, ¿qué % avanzó en el
-- embudo vs. los que no? Sin ML — pura correlación. También habilita ver la
-- trayectoria de un lead (varios briefings a lo largo del tiempo).
--
-- Escrituras: solo service role (assessLeadFit). Lectura: super_admin (centro de
-- control) y el propio tenant (misma info que ya ve en la ficha del lead).

create table if not exists ai_briefings (
  id               uuid        primary key default gen_random_uuid(),
  -- tenants.id / leads.id / agents.id son text en este esquema.
  tenant_id        text        not null references tenants(id) on delete cascade,
  lead_id          text        not null references leads(id)   on delete cascade,
  agent_id         text        references agents(id) on delete set null,
  reason           text,       -- disparador: form_submit | contact_form | email_reply | manual | action
  next_action_when text        check (next_action_when in ('hoy', 'esta_semana', 'sin_apuro')),
  read             text,       -- la lectura del lead (1 frase)
  next_action      text,       -- la próxima mejor acción
  talking_points   jsonb       not null default '[]'::jsonb,
  watch_out        text,
  -- Snapshot al momento del briefing — base para medir avance posterior.
  status_at        text,
  score_at         integer,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ai_briefings_tenant_created on ai_briefings (tenant_id, created_at desc);
create index if not exists idx_ai_briefings_lead_created   on ai_briefings (lead_id, created_at desc);

alter table ai_briefings enable row level security;

-- Lectura: ITMANO (todos) o el propio tenant. Escrituras vía service role
-- (assessLeadFit) — sin políticas de insert/update para roles autenticados.
create policy "ai_briefings_select"
  on ai_briefings for select
  using (is_super_admin() or tenant_id = get_my_tenant_id());
