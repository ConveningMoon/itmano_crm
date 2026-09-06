-- 077 — Tres dimensiones de fit que el formulario YA pregunta y el modelo tiraba.
--
-- El formulario de A&J hace diez preguntas; el modelo capturaba seis dimensiones.
-- Estas tres se perdían enteras:
--
--   "¿Necesitas vender otra propiedad antes de comprar?"     → contingency
--   "¿Estás buscando específicamente una casa en <zona>?"    → geo_fit
--   "¿Para qué usarías la propiedad?"                        → property_use
--
-- Capturar señal que YA se está recolectando rinde más que afinar la que ya se
-- usa: no cuesta una pregunta más al lead ni un cambio en el formulario.
--
-- ── Sobre los puntos ─────────────────────────────────────────────────────────
-- Se puntúa SOLO lo que se puede defender. Con cero datos de conversión, meter
-- números por intuición es exactamente el problema que este rediseño intenta
-- dejar atrás, así que cada valor de abajo tiene un porqué escrito y se ancla a
-- una regla que ya existe en vez de inventar una escala nueva.
--
-- `property_use` NO puntúa a propósito (ver al final).

-- ── contingency — comprador que debe vender primero ──────────────────────────
-- El freno número uno de una compra: el trato existe pero depende de otro trato.
-- Se modela con la MISMA forma que `agent_status` (+5 / -15) pero con castigo
-- menor, porque son frenos de distinta naturaleza: otro agente puede quitarte la
-- operación entera; una contingencia solo la retrasa. De ahí -10 y no -15.
--
-- Nota de producto (no de scoring): un comprador con contingencia es TAMBIÉN un
-- lead de venta. Hoy el CRM no puede representar esa doble oportunidad — queda
-- anotado para cuando se separe etapa de calidad en la Fase B.
insert into lead_score_rules (tenant_id, category, dimension, match_value, points, decays, is_active, label)
select v.* from (values
  (null::text, 'fit', 'contingency', 'sin_contingencia',   5, false, true, 'No necesita vender antes'),
  (null::text, 'fit', 'contingency', 'con_contingencia', -10, false, true, 'Debe vender otra propiedad primero')
) as v(tenant_id, category, dimension, match_value, points, decays, is_active, label)
where not exists (
  select 1 from lead_score_rules r
  where r.tenant_id is null and r.category = 'fit'
    and r.dimension = v.dimension and r.match_value = v.match_value
);

-- ── geo_fit — encaje con las zonas donde opera la agencia ────────────────────
-- Fuera de zona el agente puede no tener licencia, red ni comparables: no es un
-- lead peor, es un lead que quizá no puede trabajar. Se ancla también a
-- `agent_status`: -10 igual que la contingencia, porque ambos son "el trato
-- puede no llegar a existir", no "el trato es de menor calidad".
--
-- Aplica a compra Y venta: si la propiedad a listar está fuera de zona, el
-- problema es el mismo.
insert into lead_score_rules (tenant_id, category, dimension, match_value, points, decays, is_active, label)
select v.* from (values
  (null::text, 'fit', 'geo_fit', 'zona_principal',    5, false, true, 'En la zona principal'),
  (null::text, 'fit', 'geo_fit', 'zona_secundaria',   0, false, true, 'En zona secundaria'),
  (null::text, 'fit', 'geo_fit', 'fuera_de_zona',   -10, false, true, 'Fuera de la zona de la agencia')
) as v(tenant_id, category, dimension, match_value, points, decays, is_active, label)
where not exists (
  select 1 from lead_score_rules r
  where r.tenant_id is null and r.category = 'fit'
    and r.dimension = v.dimension and r.match_value = v.match_value
);

-- ── property_use — se captura, NO se puntúa ──────────────────────────────────
-- Vivienda principal / segunda vivienda / inversión cambia CÓMO se le vende al
-- lead (argumentos, ritmo, objeciones), no QUÉ TAN BUENO es. No hay evidencia de
-- que una prediga más cierres que otra, y ordenarlas por intuición sería volver
-- al problema de los números inventados.
--
-- Se registran las reglas con 0 puntos para que la dimensión exista en el
-- vocabulario y aparezca en el desglose y en analytics. En cuanto haya cierres
-- suficientes para correlacionar, estos tres valores son lo primero que se
-- calibra con datos reales en vez de con opinión.
insert into lead_score_rules (tenant_id, category, dimension, match_value, points, decays, is_active, label)
select v.* from (values
  (null::text, 'fit', 'property_use', 'vivienda_principal', 0, false, true, 'Para vivir'),
  (null::text, 'fit', 'property_use', 'segunda_vivienda',   0, false, true, 'Segunda vivienda'),
  (null::text, 'fit', 'property_use', 'inversion',          0, false, true, 'Para invertir')
) as v(tenant_id, category, dimension, match_value, points, decays, is_active, label)
where not exists (
  select 1 from lead_score_rules r
  where r.tenant_id is null and r.category = 'fit'
    and r.dimension = v.dimension and r.match_value = v.match_value
);

-- Los leads existentes no tienen estas dimensiones en su fit_profile, así que su
-- calidad no cambia. Se recalcula igual para que quede consistente si alguna ya
-- venía poblada por la IA.
do $$
declare r record;
begin
  for r in select id from leads loop
    perform recompute_lead_score(r.id);
  end loop;
end $$;

select refresh_quality_bands();
