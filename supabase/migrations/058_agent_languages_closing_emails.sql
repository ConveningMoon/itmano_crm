-- 058 · Idiomas por agente + emails de cierre por agente.
--
-- Cada agente registra los idiomas que atiende (agents.languages, siempre
-- incluye su idioma principal de ruteo agents.language). Los emails de cierre
-- (purchase_email_templates) dejan de ser por tenant y pasan a ser POR AGENTE:
-- 3 hitos × cada idioma registrado del agente (ej. Adriana es+en = 6 correos).
-- El envío resuelve el template por (tenant, agente del lead, hito, idioma
-- efectivo) — idioma del lead si el agente lo tiene registrado, si no el
-- principal del agente (src/lib/services/closing-emails-status.ts).

-- ── 1. agents.languages ───────────────────────────────────────────────────────
alter table agents
  add column if not exists languages text[] not null default array['es'];

-- Backfill: cada agente arranca con su idioma principal registrado.
update agents set languages = array[language];

-- Subconjunto de es/en/pt, nunca vacío, y el idioma principal (ruteo) siempre
-- registrado — la UI impide desmarcarlo.
alter table agents drop constraint if exists agents_languages_check;
alter table agents add constraint agents_languages_check check (
  languages <@ array['es', 'en', 'pt']
  and array_length(languages, 1) >= 1
  and language = any (languages)
);

-- ── 2. purchase_email_templates.agent_id ──────────────────────────────────────
alter table purchase_email_templates
  add column if not exists agent_id text references agents(id) on delete cascade;

-- La unicidad por tenant debe caer ANTES del backfill (varias filas por-agente
-- comparten el mismo (tenant, hito, idioma)).
alter table purchase_email_templates
  drop constraint if exists purchase_email_templates_tenant_id_milestone_language_key;

-- Backfill: una fila por (agente activo × hito × idioma registrado), copiando
-- el contenido del template de tenant (agent_id null) si existía para ese
-- (hito, idioma). Los agentes heredan lo ya configurado en su idioma.
insert into purchase_email_templates (tenant_id, agent_id, milestone, language, resend_template_id, subject, body_json)
select
  a.tenant_id,
  a.id,
  m.milestone,
  l.lang,
  coalesce(t.resend_template_id, ''),
  t.subject,
  t.body_json
from agents a
cross join (values ('start'), ('pre_close'), ('completed')) as m(milestone)
cross join lateral unnest(a.languages) as l(lang)
left join purchase_email_templates t
  on  t.tenant_id = a.tenant_id
  and t.milestone = m.milestone
  and t.language  = l.lang
  and t.agent_id is null
where a.active = true;

-- Las filas de tenant (agent_id null) quedan obsoletas: el envío y la UI ahora
-- son estrictamente por agente.
delete from purchase_email_templates where agent_id is null;

alter table purchase_email_templates alter column agent_id set not null;

-- Unicidad por agente.
alter table purchase_email_templates
  add constraint purchase_email_templates_agent_milestone_language_key
  unique (tenant_id, agent_id, milestone, language);

create index if not exists idx_purchase_email_templates_agent
  on purchase_email_templates(agent_id);
