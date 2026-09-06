# Scoring, calidad y urgencia

El scoring dirige la atención operativa y las notificaciones. La fuente de
verdad del cálculo es `recompute_lead_score(lead_id)` en Postgres. Los pesos
viven en `lead_score_rules` y se consultan en la base actual mediante MCP; no se
congelan en documentación.

## Modelo

`current_score = clamp(0..100, fit_score + engagement_score + manual_score)`.
Los componentes se guardan por separado:

| Categoría | Fuente | Decay |
|---|---|---|
| Fit | `leads.fit_profile`, un bucket por dimensión | No |
| Engagement | Eventos que coinciden con reglas activas | Sí, sólo positivos configurados |
| Manual | Acciones registradas por el agente | No |

Cada regla puede definir categoría, dimensión, valor, puntos, decay, estado y
side effect. El modelo pertenece a ITMANO. Sólo `super_admin` edita reglas; un
override por tenant se reserva para excepciones deliberadas.

## Invariantes

- Los opens de email se registran para diagnóstico, pero no puntúan ni se usan
  como KPI de engagement por Apple Mail Privacy Protection. El clic es la señal
  fiable.
- El score no se congela al mover la etapa. Desde la migración 082,
  `leads.stage` es independiente del scoring.
- El decay se calcula por evento: 100% durante 14 días y luego mitad cada 30 días
  para reglas positivas con `decays=true`. Fit y señales negativas no decaen.
- `peak_score` es sólo un máximo histórico.
- `side_effect='force_perdido'` domina la suma y puede afectar eventos antiguos
  al activar una regla. Revísalo antes de recalcular en masa.
- `(lead_id, dedup_key)` impide que reintentos inflen puntos.
- El cron diario llama `decay_lead_scores`, que vuelve a ejecutar el cálculo
  autoritativo. Los errores del cron deben observarse; un fallo silencioso deja
  bandas antiguas.

## Tres ejes independientes

| Eje | Pregunta | Control |
|---|---|---|
| Etapa (`leads.stage`) | ¿Dónde está en el embudo? | Agente |
| Calidad (`quality_score`/banda) | ¿Qué tan bueno es? | Sistema |
| Urgencia derivada | ¿Hay que actuar hoy? | Sistema con decay |

Etapas: `nuevo`, `nutricion`, `en_proceso`, `cerrado`, `perdido`. La única
transición automática de etapa admitida corresponde a hechos con
`force_perdido`. Toda transición se registra en `lead_status_history`.

Las bandas de calidad son quintiles de la cartera activa del tenant. Con menos
de 20 leads activos se usan cortes de fallback en
`src/lib/scoring/score-bands.ts`. Para contar leads “altos”, usa la banda, no un
literal de score repartido por la UI.

`refresh_quality_bands()` depende del vocabulario de etapas. Tras cambiarlo,
verifica ejecución y `tenant_quality_bands.computed_at`.

## IA

Con `tenants.ai_lead_scoring_enabled`, `src/lib/services/ai-lead-fit.ts` usa IA
para interpretar respuestas en buckets válidos y producir un briefing. La IA no
decide puntos: Postgres valora los buckets mediante reglas.

El flujo es best-effort y debe cerrarse sin romper intake cuando está desactivado,
falta una key o se agotó el presupuesto. Ejecutarlo en pruebas consume dinero
real; aplica la regla de aviso previo de `AGENTS.md`.

Antes de tocar scoring, consulta el grafo, `src/lib/scoring/`, la función actual
en sandbox y las reglas actuales mediante MCP.
