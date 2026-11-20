# Fase 9 — Proveedores de IA: gasto y crédito real

**Objetivo:** saber cuánto crédito queda en Anthropic y Google y enterarse
antes de que se acabe, no cuando la IA falla para todos los clientes.

## Lo que se puede y no se puede leer (verificado el 2026-11-18)

- **Anthropic:** no hay endpoint de saldo prepagado. La Admin API ofrece
  Usage & Cost Analytics (`/v1/organizations/analytics/cost`, beta, en el SDK
  como `client.beta.organization.analytics.cost`), con un retraso de 4 a 24 h,
  y una llave de administrador `sk-ant-admin…`. El costo viene antes de
  créditos.
- **Google AI:** el saldo prepago sólo se ve en AI Studio. Cloud Billing ofrece
  presupuestos con alertas a Pub/Sub (retraso de hasta 24 h). Cuando el saldo
  prepago llega a $0, todas las llaves del billing account dejan de funcionar.
- **Tiempo real:** sólo `ai_usage_events`, que el CRM ya registra con el costo
  calculado por llamada.

## Decisión previa

- **D7** — Recomendado: auto-recarga con tope mensual en Anthropic Console y
  en Google AI Studio/Cloud Billing. Con auto-recarga el "saldo" deja de ser
  el riesgo, y lo que se vigila es el gasto contra el presupuesto.

## Diseño: saldo estimado

`saldo estimado = último saldo anotado − gasto registrado desde esa fecha`

- Dylan anota el saldo (o la recarga) en `provider_settings` (fase 2) cuando
  carga crédito. El panel resta en tiempo real el gasto de `ai_usage_events`.
- Un cron diario concilia con la Admin API de Anthropic (gasto real del día
  anterior) y muestra la diferencia contra lo registrado por el CRM. Una
  diferencia grande revela consumo fuera del CRM (local, pruebas u otra app
  con la misma llave).
- Google: presupuesto en Cloud Billing con notificación Pub/Sub → push a
  `POST /api/webhooks/gcp-budget` (verificar el token OIDC de Pub/Sub), que
  guarda el gasto reportado.

## Tareas

- [ ] Dylan: crear una llave Admin de Anthropic **sólo para lectura de
      analytics** si la consola lo permite; si no, guardar la admin key sólo en
      Vercel producción como `ANTHROPIC_ADMIN_API_KEY`, nunca en local.
- [ ] Cron `ai-cost-reconcile` (diario) con el SDK de Anthropic
      (`client.beta.organization.analytics.cost.list`, agrupado por modelo y
      `api_key_id`). Comprobar la forma exacta en la doc viva antes de escribir.
- [ ] Detección inmediata: cuando Anthropic responde con un error de saldo
      insuficiente o Gemini con un error de billing, registrar el evento y
      mandar alerta de Telegram al momento (una por hora como máximo).
      Centralizarlo en el punto común de llamadas de IA.
- [ ] Llaves separadas por entorno: la de producción no se usa en local, así
      `ALLOW_LOCAL_AI_SPEND` gasta de otra llave con su propio límite.
- [ ] Tarjetas de Anthropic y Google en el panel: gasto del mes, saldo
      estimado, días de saldo al ritmo actual y diferencia de conciliación.

## Criterio de terminado

- El panel muestra saldo estimado y gasto conciliado de Anthropic.
- Simulando un error de saldo en sandbox llega una sola alerta de Telegram.
- Un presupuesto de Google de prueba genera un evento visible en el panel.
