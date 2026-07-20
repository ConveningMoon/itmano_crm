-- 064 · Análisis de fit de leads con IA (fase de prueba, apagado por tenant).
--
-- El motor de scoring (029) ya deriva el componente "fit" de leads.fit_profile
-- (mapa dimensión→bucket) contra lead_score_rules. Esta fase agrega una capa de
-- INTERPRETACIÓN con IA: en vez de mapear las respuestas del formulario a buckets
-- de forma fija, un modelo (Haiku) lee las respuestas + el contexto de la agencia
-- y del agente + el mercado, y produce los buckets adecuados PARA ESE mercado
-- (ej.: "$200k" es premium en LatAm y de entrada en EE. UU.). Luego
-- recompute_lead_score los valora con las reglas ajustables (Ajustes → Scoring).
-- No se duplica puntaje: la IA interpreta, las reglas valoran.
--
-- Se activa por tenant desde el centro de control (super_admin) y arranca
-- APAGADO — los leads reales no se analizan hasta activarlo a propósito.

-- Toggle por tenant (apagado por defecto).
alter table tenants
  add column if not exists ai_lead_scoring_enabled boolean not null default false;

-- Descripción general de la agencia (mercado, ciudad, rangos de inversión,
-- perfil de comprador, tono). La IA la consulta para personalizar el análisis
-- y para entender el contexto de mercado del tenant.
alter table tenants
  add column if not exists description text;

-- Descripción por agente (especialidad, idiomas, historia). La IA la consulta
-- para personalizar el fit y el contenido que genera.
alter table agents
  add column if not exists description text;
