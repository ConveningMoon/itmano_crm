-- 088 — El monto declarado por el lead, como columna ordenable.
--
-- El intake ya guarda el monto en metadata.budget_amount (ver intake-fit.ts):
-- el bucket de presupuesto dice en qué rango cae el lead, el monto dice cuánto
-- vale la operación. El detalle del lead ya lo muestra leyendo metadata, pero
-- ORDENAR la lista por él necesita una columna real — la lista pagina en la base
-- y PostgREST no sabe ordenar por un campo JSON casteado a número.
--
-- Columna GENERADA, no una columna normal que el intake tenga que mantener al
-- día: metadata sigue siendo la única fuente y no hay forma de que las dos se
-- desincronicen. Tampoco hace falta backfill — se deriva de lo que ya hay.
--
-- `jsonb_typeof` es el guardián: si alguna vez entra un string en esa clave, la
-- columna queda null en vez de reventar el INSERT del lead entero.

alter table leads
  add column if not exists budget_amount numeric
  generated always as (
    case when jsonb_typeof(metadata -> 'budget_amount') = 'number'
         then (metadata ->> 'budget_amount')::numeric
    end
  ) stored;

comment on column leads.budget_amount is
  'Monto declarado por el lead, derivado de metadata.budget_amount. Sólo para ordenar y calcular la comisión potencial — NO entra al scoring.';

-- El orden por valor pagina dentro de la cartera de un tenant.
create index if not exists leads_tenant_budget_idx
  on leads (tenant_id, budget_amount desc nulls last);

-- La vista de la lista, con la columna nueva AL FINAL (create or replace exige
-- que las anteriores no cambien de tipo ni de orden).
create or replace view public.leads_list as
 SELECT l.id,
    l.tenant_id,
    l.agent_id,
    l.first_name,
    l.last_name,
    l.email,
    l.phone,
    l.language,
    l.lender,
    l.notes,
    l.created_at,
    l.updated_at,
    l.acquisition_channel_id,
    l.traffic_source,
    l.traffic_source_detail,
    l.peak_score,
    l.current_score,
    l.last_event_at,
    l.score_updated_at,
    l.metadata,
    l.fit_profile,
    l.fit_score,
    l.engagement_score,
    l.manual_score,
    l.email_blocked,
    l.email_blocked_reason,
    l.search_text,
    l.quality_score,
    l.last_signal_at,
    l.last_signal_type,
    l.stage,
    jsonb_exists(COALESCE(l.metadata, '{}'::jsonb), 'imported'::text) AS is_imported,
        CASE
            WHEN COALESCE(b.active_leads, 0) < 20 THEN
            CASE
                WHEN COALESCE(l.quality_score, 0) >= 80 THEN 'alta'::text
                WHEN COALESCE(l.quality_score, 0) >= 60 THEN 'media_alta'::text
                WHEN COALESCE(l.quality_score, 0) >= 35 THEN 'media'::text
                WHEN COALESCE(l.quality_score, 0) >= 15 THEN 'media_baja'::text
                ELSE 'baja'::text
            END
            ELSE
            CASE
                WHEN COALESCE(l.quality_score, 0) >= b.p80 THEN 'alta'::text
                WHEN COALESCE(l.quality_score, 0) >= b.p60 THEN 'media_alta'::text
                WHEN COALESCE(l.quality_score, 0) >= b.p40 THEN 'media'::text
                WHEN COALESCE(l.quality_score, 0) >= b.p20 THEN 'media_baja'::text
                ELSE 'baja'::text
            END
        END AS quality_band,
        CASE
            WHEN l.stage <> ALL (ARRAY['nuevo'::text, 'nutricion'::text]) THEN NULL::text
            WHEN ai.fresh_when IS NOT NULL THEN ai.fresh_when
            WHEN l.last_signal_at > (now() - '48:00:00'::interval) AND (l.last_signal_type = ANY (ARRAY['email_replied'::text, 'contact_us_question'::text])) THEN 'hoy'::text
            WHEN l.last_signal_at > (now() - '7 days'::interval) THEN 'esta_semana'::text
            ELSE 'sin_apuro'::text
        END AS urgency,
        CASE
            WHEN l.stage <> ALL (ARRAY['nuevo'::text, 'nutricion'::text]) THEN 9
            WHEN ai.fresh_when = 'hoy'::text THEN 0
            WHEN ai.fresh_when = 'esta_semana'::text THEN 1
            WHEN ai.fresh_when = 'sin_apuro'::text THEN 2
            WHEN l.last_signal_at > (now() - '48:00:00'::interval) AND (l.last_signal_type = ANY (ARRAY['email_replied'::text, 'contact_us_question'::text])) THEN 0
            WHEN l.last_signal_at > (now() - '7 days'::interval) THEN 1
            ELSE 2
        END AS urgency_rank,
    l.budget_amount
   FROM leads l
     LEFT JOIN tenant_quality_bands b ON b.tenant_id = l.tenant_id
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN s.at_ts IS NULL THEN NULL::text
                    WHEN s.w = 'hoy'::text AND s.at_ts > (now() - '48:00:00'::interval) THEN 'hoy'::text
                    WHEN s.w = 'esta_semana'::text AND s.at_ts > (now() - '7 days'::interval) THEN 'esta_semana'::text
                    WHEN s.w = 'sin_apuro'::text AND s.at_ts > (now() - '7 days'::interval) THEN 'sin_apuro'::text
                    ELSE NULL::text
                END AS fresh_when
           FROM ( SELECT l.metadata #>> '{ai_fit,next_action_when}'::text[] AS w,
                        CASE
                            WHEN (l.metadata #>> '{ai_fit,at}'::text[]) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'::text THEN (l.metadata #>> '{ai_fit,at}'::text[])::timestamp with time zone
                            ELSE NULL::timestamp with time zone
                        END AS at_ts) s) ai ON true;

-- La vista hereda las policies de quien consulta, no las del dueño.
alter view public.leads_list set (security_invoker = on);
