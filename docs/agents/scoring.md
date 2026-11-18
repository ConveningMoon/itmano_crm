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
- El cron diario (Vercel Cron, `GET /api/cron/score-decay` con `CRON_SECRET`)
  llama `decay_lead_scores` y después `refresh_quality_bands`. Entre agosto y
  noviembre de 2026 la ruta sólo aceptaba `POST` y las bandas quedaron
  congeladas sin que nadie lo notara; el Centro de control avisa ahora si
  `tenant_quality_bands.computed_at` supera 36 h.

## Tres ejes independientes

| Eje | Pregunta | Control |
|---|---|---|
| Etapa (`leads.stage`) | ¿Dónde está en el embudo? | Agente |
| Calidad (`quality_score`/banda) | ¿Qué tan bueno es? | Sistema |
| Urgencia derivada | ¿Hay que actuar hoy? | Sistema con decay |

Etapas: `nuevo`, `nutricion`, `en_proceso`, `cerrado`, `perdido`. La única
transición automática de etapa admitida corresponde a hechos con
`force_perdido`. Toda transición se registra en `lead_status_history`.

La cartera activa (`ACTIVE_STAGES`: `nuevo` y `nutricion`) define bandas, cola
de hoy y secuencias por etiqueta. Las acciones manuales del agente usan otro
conjunto, `MANUAL_ACTION_STAGES`, que suma `en_proceso`: visitas, propuestas y
citas ocurren justo en esa etapa. Cerrado y Perdido no admiten acciones.

Las bandas de calidad son quintiles de la cartera activa del tenant. Con menos
de 20 leads activos se usan cortes de fallback en
`src/lib/scoring/score-bands.ts`. Para contar leads “altos”, usa la banda, no un
literal de score repartido por la UI.

Si los quintiles no distinguen (dos cortes iguales o `p80 - p20 < 10`),
`refresh_quality_bands` marca `tenant_quality_bands.degenerate` y `leads_list`
usa también los cortes fijos. Pasa cuando los leads no declaran perfil y casi
todos suman lo mismo; el Centro de control lo avisa. Los cortes fijos viven en
tres sitios: `score-bands.ts`, `leads_list` y `preview_score_rule_changes`.

## Modelo automático (migración 20261118120000)

- Cambiar puntos globales (Centro de control → Scoring) muestra antes el
  impacto por tenant (`preview_score_rule_changes`) y al aplicar recalcula todos
  los leads (`recompute_scores_bulk`, sin avisos de lead caliente) y las bandas.
  `decay_lead_scores` sólo recalcula leads sin eventos en 14 días: no sirve para
  propagar un cambio de modelo.
- Las protecciones (reglas con `side_effect`) no se editan desde la UI.
- Calibración por tenant: el cron diario (`runAutoCalibrations`) reordena los
  factores de perfil cuando hay 50 cierres con perfil, como mucho cada 7 días y
  sólo si un factor separa al menos 5 pp más. Reparte los mismos máximos
  globales. Cada calibración (auto, manual o vuelta al global) queda en
  `scoring_calibrations`. La lógica pura está en `planAutoCalibration`.
- `scoring_health(tenant)` y `scoring_rule_usage(tenant, días)` alimentan la
  salud por tenant (`src/lib/scoring/health.ts`) y el uso de cada regla.
- `open_house_attended` (+25, decae) puntúa la asistencia marcada en la lista de
  un open house: la señal automática más cercana a una visita.

`refresh_quality_bands()` depende del vocabulario de etapas. Tras cambiarlo,
verifica ejecución y `tenant_quality_bands.computed_at`.

## IA

Con `tenants.ai_lead_scoring_enabled`, `src/lib/services/ai-lead-fit.ts` usa IA
para interpretar respuestas en buckets válidos y producir un briefing. La IA no
decide puntos: Postgres valora los buckets mediante reglas.

El contexto que recibe la IA debe cubrir todo lo que el agente ve en la ficha:
formularios, `lead_events`, etiquetas (no escriben eventos, ver migración 116),
RSVPs y asistencia a open houses, correos escritos por el lead, notas,
prestamista, presupuesto, procedencia, proceso de compra y secuencias activas.
Las secciones se formatean en `src/lib/services/lead-fit-context.ts`; si una
feature nueva guarda hechos del lead fuera de `lead_events`, agrégala ahí.

El flujo es best-effort y debe cerrarse sin romper intake cuando está desactivado,
falta una key o se agotó el presupuesto. Ejecutarlo en pruebas consume dinero
real; aplica la regla de aviso previo de `AGENTS.md`.

Antes de tocar scoring, consulta el grafo, `src/lib/scoring/`, la función actual
en sandbox y las reglas actuales mediante MCP.
