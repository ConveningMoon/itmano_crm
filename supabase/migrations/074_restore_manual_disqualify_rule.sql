-- 074 — Restaura la regla 'manual_disqualify' que faltaba en la base.
--
-- QUÉ PASÓ
-- La migración 029 siembra 34 reglas en lead_score_rules. La base tenía 33: la
-- única ausente era `manual_disqualify` (categoría manual, side_effect
-- 'force_perdido'). Ninguna migración posterior la borra, y la app NO tiene
-- ningún camino que haga DELETE sobre lead_score_rules — Configuración →
-- Scoring solo permite UPDATE de `points` y `is_active`. Es decir: la fila se
-- borró con SQL manual contra la base, fuera del control de versiones.
--
-- POR QUÉ IMPORTA
-- El panel de acciones manuales del detalle del lead se construye leyendo esta
-- tabla (`category = 'manual' AND is_active`), así que sin la fila el botón
-- "Descalificar" simplemente no se renderiza: la acción desapareció del producto
-- sin dejar rastro ni error. Además dejaba fallando el caso
-- "manual_disqualify forces score 0 / status lost" de tests/scoring, que era la
-- única señal visible de la deriva.
--
-- Los valores replican exactamente la fila de la 029: 0 puntos (el efecto no es
-- de puntaje sino el side_effect), decays=false, is_active=true.
--
-- Idempotente: la 029 eliminó la constraint única de la tabla, así que en lugar
-- de ON CONFLICT se guarda con NOT EXISTS. Reejecutar esta migración no duplica.
insert into lead_score_rules
  (tenant_id, category, dimension, event_type, points, decays, is_active, side_effect, label)
select
  null, 'manual', 'manual_disqualify', 'manual_disqualify', 0, false, true,
  'force_perdido', 'Descalificación manual'
where not exists (
  select 1 from lead_score_rules
  where tenant_id is null
    and category  = 'manual'
    and dimension = 'manual_disqualify'
);
