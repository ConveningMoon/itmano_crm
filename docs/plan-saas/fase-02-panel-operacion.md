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

- [ ] Spec y plan de tareas de la fase (superpowers).
- [ ] Migración con las tres tablas, RLS, grants y test en `test:schema`.
- [ ] Helper `recordHeartbeat(job, fn)` y latidos en los 4 crons y 2 webhooks.
- [ ] Cron `platform-metrics-snapshot` (diario) con métricas de la base:
      tamaño de base, Storage por bucket y por tenant, uso por tenant contra el
      plan.
- [ ] Página `/admin/operacion` con `loading.tsx` en forma de página y cada
      bloque en su `<Suspense>`. Lecturas en `src/lib/data/platform-ops.ts`,
      en una ola (`Promise.all`).
- [ ] Formulario de `provider_settings` (Server Action con `useTransition`).
- [ ] Cron `platform-alerts` y su tabla de deduplicación.
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
