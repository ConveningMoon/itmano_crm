-- 089 — El análisis de fit con IA deja de ser opcional.
--
-- Nació como fase de prueba, apagado por tenant y encendido a mano desde el
-- centro de control. Ya no: es parte de lo que el cliente compra, y tenerlo
-- apagado significa que la mitad del modelo (la interpretación del perfil según
-- el mercado de esa agencia) no corre y nadie se entera.
--
-- La columna se queda: los gates de suscripción y de presupuesto de IA siguen
-- viviendo en el servicio (ai-lead-fit.ts), y un interruptor de emergencia por
-- tenant sigue siendo útil para ITMANO — lo que se retira es la pantalla que
-- invitaba a apagarlo.

alter table tenants alter column ai_lead_scoring_enabled set default true;
update tenants set ai_lead_scoring_enabled = true where ai_lead_scoring_enabled is distinct from true;
