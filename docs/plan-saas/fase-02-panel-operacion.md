# Fase 2 — Panel de operación y alertas

**Objetivo:** un solo lugar (Centro de control, sólo `super_admin`) donde ver
cada límite que paga o aporta ITMANO, por proveedor y por cliente, con
alertas por Telegram antes de que algo se agote.

## Diseño

### Datos

- `platform_metrics` (nueva, sin `tenant_id` o con `tenant_id` nullable:
  justificar en la migración porque es una tabla de plataforma). Una fila por
  `(captured_at, provider, metric, tenant_id?)` con `value`, `limit` y `unit`.
  La escriben un cron diario (foto) y los propios envíos (tiempo real).
- `cron_heartbeats` (nueva): `job`, `started_at`, `finished_at`, `ok`,
  `detail`. Cada cron (`score-decay`, `sequence-orchestrator`,
  `billing-lifecycle`, `warm`) y cada webhook (Resend, Paddle) escribe su
  latido. Ventana esperada por job declarada en código.
- `provider_settings` (nueva): lo que el sistema no puede leer de los
  proveedores y Dylan escribe a mano: plan contratado de cada cuenta, cuota,
  número de dominios, saldo cargado, fecha de renovación y vencimiento de
  llaves (Paddle a 90 días, tokens de agente a 90 días, dominio).
- RLS: sólo `super_admin` lee y escribe; `service_role` con CRUD. Grants
  explícitos según `docs/agents/environments.md`.

### Bloques del panel (`/admin/operacion`)

1. **Proveedores** — una tarjeta por cuenta con barra de uso y semáforo:
   - Resend ITMANO: correos hoy y en el mes contra la cuota (fase 3 aporta los
     datos reales, Magic Links incluidos) y dominios usados contra los del plan.
   - Resend A&J: lo mismo, informativo (lo paga A&J, pero un tope diario
     agotado rompe su operación).
   - Anthropic y Google: gasto del mes contra presupuesto y saldo estimado
     (fase 9).
   - Supabase: tamaño de base contra 500 MB / 8 GB, Storage contra 1 GB / 100 GB
     y archivos huérfanos (fase 4).
   - Vercel: gasto del ciclo (MCP o API de facturación, fase 2B).
2. **Clientes** — una fila por tenant: plan, estado, días de prueba, y uso
   contra el plan en leads, correos del mes, IA del mes, logins, propiedades
   publicadas y Storage. Ordenable por "más cerca del límite".
3. **Salud** — último latido de cada cron y webhook, con rojo si se pasó de su
   ventana. Integraciones configuradas: booleanos calculados en servidor
   (`!!process.env.X`), nunca valores.
4. **Economía** — ingreso mensual por cliente (Paddle o manual) contra su
   costo variable (IA + correos). Margen por cliente.
5. **Calendario** — vencimientos de `provider_settings` ordenados por fecha.

### Alertas

- Cron diario `platform-alerts` (Vercel Cron): evalúa umbrales y manda
  Telegram a los `super_admin` con `telegram_chat_id` (servicio existente
  `src/lib/services/telegram.ts`).
- Umbrales por defecto: 80% y 95% de cualquier cuota, cron sin latido en 2×
  su ventana, vencimiento a 14 y 3 días, Storage al 75%.
- Deduplicar: una alerta por `(métrica, umbral, periodo)` en una tabla
  `platform_alerts` para no repetir cada día.
- Resumen semanal los lunes.

## Tareas

Rama `feat/saas-fase-02-panel`. Plan de tareas:
`docs/superpowers/plans/2026-11-18-saas-fase-02-panel-operacion.md` (local: `docs/superpowers/` no se versiona; las decisiones que importan están en este archivo).

- [x] Plan de tareas de la fase.
- [x] Migración `platform_ops`: 4 tablas (`cron_heartbeats`,
      `provider_settings`, `platform_metrics`, `platform_alerts`), RLS de
      lectura sólo `super_admin`, grants y RPC `record_heartbeat`,
      `platform_usage`, `platform_totals` y `ai_spend_since` (sólo
      `service_role`). Probada en sandbox con `test:schema`, `test:rls`
      (`tests/rls/platform_ops.test.ts`) y advisors.
- [x] `withHeartbeat` en `score-decay`, `sequence-orchestrator`,
      `billing-lifecycle`, `warm` (sólo la llamada del cron), `platform-ops` y
      los webhooks de Resend y Paddle. Un 401/403 no cuenta como ejecución.
- [x] Un solo cron diario `/api/cron/platform-ops` (12:00 UTC en
      `vercel.json`): foto en `platform_metrics`, alertas por Telegram
      deduplicadas y purga a 400 días.
- [x] Página `/admin/operacion` con `loading.tsx` y una sola carga en
      `<Suspense>`: todos los bloques salen del mismo modelo
      (`src/lib/ops/model.ts`), así que partirlos en varios Suspense no adelanta
      nada. Ítem "Operación" en la navegación del `super_admin`.
- [x] Editor de `provider_settings` (Server Action con `useTransition`). Al
      cambiar el saldo de IA se anota la fecha, y desde ahí el panel resta el
      gasto registrado (saldo estimado).
- [x] Migración aplicada en producción el 2026-11-18, tras el gate de
      sandbox. Verificada con `service_role` (8 proveedores sembrados, uso y
      totales correctos) y advisors sin hallazgos nuevos. Hay un `super_admin`
      con Telegram para recibir las alertas.
- [ ] Dylan: anotar en `/admin/operacion` los datos de cada proveedor (plan y
      cuotas de Resend, saldo y presupuesto de IA, fecha del último backup,
      renovaciones y vencimientos de llaves). Sin eso, esos indicadores quedan
      "sin límite" y el backup marca urgente.
- [ ] Ver la página en producción con sesión de `super_admin` después del merge.
      En local no se pudo: el login de desarrollo necesita un secreto que el
      agente no tiene permiso de leer.
- [ ] 2B (después de las fases 3 y 9): conectar las fuentes reales de Resend,
      Anthropic, Google y Vercel.

## Cache Components

Ruta del dashboard que lee sesión y datos de todos los tenants: shell
estático + streaming detrás de `<Suspense>`. **No** usar `use cache`
compartido (mezcla datos de clientes y sólo la ve `super_admin`). Como mucho,
`use cache: private` para la vista del propio `super_admin`; no hace falta en
la primera versión.

## Criterio de terminado

- Con datos de sandbox, el panel muestra los 5 bloques, y un umbral forzado
  dispara una sola alerta de Telegram a un chat de prueba.
- Un cron detenido aparece en rojo tras su ventana.
- Verificación completa de `AGENTS.md` + `test:schema` y `test:rls`.
