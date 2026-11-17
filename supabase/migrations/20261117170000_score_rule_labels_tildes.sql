-- Ortografía de las etiquetas de las reglas GLOBALES de scoring (tenant_id
-- nulo). Se ven en Configuración → Scoring y en la ficha del lead ("A favor").
-- Sólo texto: puntos, dimensiones y match_value no cambian, y ningún código
-- busca reglas por etiqueta. Las reglas propias de un tenant no se tocan.
--
-- Las tres de motivación de venta existen en producción y no en sandbox; el
-- UPDATE por etiqueta exacta es inocuo donde no estén.

update public.lead_score_rules set label = 'Motivación de venta alta'
 where tenant_id is null and label = 'Motivacion de venta alta';
update public.lead_score_rules set label = 'Motivación de venta media'
 where tenant_id is null and label = 'Motivacion de venta media';
update public.lead_score_rules set label = 'Motivación de venta baja'
 where tenant_id is null and label = 'Motivacion de venta baja';
update public.lead_score_rules set label = 'Desuscripción'
 where tenant_id is null and label = 'Desuscripcion';
update public.lead_score_rules set label = 'Clic en email'
 where tenant_id is null and label = 'Click en email';
