-- 056 · Atribución por agente del uso de IA.
--
-- Para el plan Partner (multi-login) el presupuesto mensual de IA del tenant
-- se reparte en partes iguales entre los agentes del equipo (tenants con
-- ai_unlimited = true no reparten nada). Cada request queda atribuido al
-- agente vinculado al login que lo generó (agents.user_id = auth uid); el
-- enforcement por parte vive en src/lib/services/ai-limit.ts.

alter table ai_usage_events
  add column if not exists agent_id text references agents(id) on delete set null;

create index if not exists idx_ai_usage_agent_created
  on ai_usage_events (agent_id, created_at desc);

-- Backfill del histórico: atribuir cada evento al agente vinculado a su login.
update ai_usage_events e
set agent_id = a.id
from agents a
where e.agent_id is null
  and e.user_id is not null
  and a.user_id = e.user_id
  and a.tenant_id = e.tenant_id;
