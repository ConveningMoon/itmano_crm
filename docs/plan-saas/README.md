# Plan SaaS: ITMANO listo para clientes que pagan, configuran y usan solos

Creado el 2026-11-18. Fuente de verdad del avance de este plan: la tabla de
estado de abajo. Cada fase tiene su archivo con alcance, tareas, decisiones y
criterio de terminado.

## Objetivo

1. **Autoservicio.** Un cliente nuevo se registra, paga, configura su equipo,
   su dominio, su web y sus avisos de Telegram, y usa el CRM sin escribir a
   ITMANO. Contactar a ITMANO es la excepción (migraciones Partner, problemas).
2. **Supervisión.** Todo lo que paga o aporta ITMANO —cuotas de Resend
   (incluidos los Magic Links de Supabase), crédito de Anthropic y Google,
   almacenamiento, crons— se ve en un solo panel con alertas antes de agotarse.
3. **Planes que se cumplen.** Lo que vende `src/lib/plans.ts` es lo que el
   sistema permite, sin depender de que alguien lo vigile a mano.
4. **Costos bajo control.** Storage optimizado y gasto por cliente medible.
5. **Supabase Pro al final**, cuando lo demás está listo (decisión de Dylan).

Este plan es la petición explícita que `docs/agents/product.md` exige para
empezar el signup autoservicio y el onboarding automático de tenants. Al
cerrar la fase 8, actualiza esa sección de `product.md`.

## Estado

| # | Fase | Archivo | Depende de | Estado |
|---|---|---|---|---|
| 0 | Línea base medida el 2026-11-18 | [00-linea-base.md](00-linea-base.md) | — | ✅ referencia |
| 1 | Seguridad y limpieza rápida || — | ✅ `feat/saas-fase-01-seguridad` (2026-11-18), pendiente de PR |
| 2 | Panel de operación y alertas | [fase-02-panel-operacion.md](fase-02-panel-operacion.md) | 1 | ⬜ pendiente |
| 3 | Correo: Magic Links, cuotas de Resend y crons | [fase-03-correo-auth-crons.md](fase-03-correo-auth-crons.md) | 2 (tabla de métricas) | ⬜ pendiente |
| 4 | Storage: optimización y limpieza | [fase-04-storage.md](fase-04-storage.md) | — (paralela a 2-3) | ⬜ pendiente |
| 5 | Cobros con Paddle Live | [fase-05-cobros-paddle.md](fase-05-cobros-paddle.md) | 1 | ⬜ pendiente |
| 6 | Límites del plan en código | [fase-06-limites-plan.md](fase-06-limites-plan.md) | 5 | ⬜ pendiente |
| 7 | Telegram autoservicio | [fase-07-telegram.md](fase-07-telegram.md) | — | ⬜ pendiente |
| 8 | Alta y onboarding autoservicio | [fase-08-alta-autoservicio.md](fase-08-alta-autoservicio.md) | 3, 5, 6, 7 | ⬜ pendiente |
| 9 | Proveedores de IA: gasto y crédito real | [fase-09-proveedores-ia.md](fase-09-proveedores-ia.md) | 2 | ⬜ pendiente |
| 10 | Legal, soporte y operación SaaS | [fase-10-legal-soporte.md](fase-10-legal-soporte.md) | 8 | ⬜ pendiente |
| 11 | Supabase Pro (al final) | [fase-11-supabase-pro.md](fase-11-supabase-pro.md) | todas | ⬜ pendiente |

Estados: ⬜ pendiente · 🟨 en curso (rama y fecha) · ✅ hecha (PR y fecha) ·
⏸ bloqueada (motivo).

Orden recomendado: 1 → (2, 4 y 7 en paralelo si hay dos sesiones, nunca en
la misma rama) → 3 → 5 → 6 → 9 → 8 → 10 → 11. La fase 8 es la grande y
necesita casi todo lo anterior.

## Cómo retomar este plan en otra sesión

1. Lee `AGENTS.md`, este README y el archivo de la fase que toca.
2. `git fetch --prune` y busca si la fase ya tiene rama (`git branch -a`).
   Una rama, un dueño: no edites la rama de otra sesión en curso.
3. Para una fase sin rama: crea `feat/saas-fase-NN-<tema>` desde `main`.
4. Antes de escribir código, convierte la fase en spec y plan de tareas con
   el flujo habitual (`docs/superpowers/specs` y `docs/superpowers/plans`).
   Este archivo dice **qué** y **por qué**; el plan de la fase dice **cómo**.
5. Marca la fase 🟨 en la tabla de estado en el primer commit de la rama.
6. Al terminar: verificación de `AGENTS.md`, commit, push, marca ✅ con el
   número de PR (Dylan abre el PR) y anota en "Registro" lo aprendido que
   cambie otras fases.
7. Si una decisión pendiente bloquea, márcala ⏸ y pregúntala a Dylan; no la
   inventes.

## Decisiones tomadas

| Fecha | Decisión |
|---|---|
| 2026-11-18 | Supabase pasa a Pro al final de todo el proceso (fase 11). |
| 2026-11-18 | A&J mantiene su propia cuenta de Resend (plan Free); no se migra a ITMANO. |
| 2026-11-18 | Objetivo de producto: autoservicio tipo SaaS (pagar, configurar, usar) con el mínimo contacto con ITMANO. |
| 2026-11-18 | Los Magic Links salen de la cuenta de Resend de ITMANO: su cuota se supervisa. |

## Decisiones pendientes de Dylan

Cada fase las repite donde aplican. Respóndelas antes de empezar esa fase.

| # | Pregunta | Recomendación | Fase |
|---|---|---|---|
| D1 | ¿Qué plan tiene hoy la cuenta de Resend de ITMANO? | Si es Free (100/día), pasar a Pro ($20) antes del primer cliente nuevo | 3 |
| D2 | ¿La prueba de 14 días pide tarjeta? | Sin tarjeta, pero con verificación de email y sin dominio propio | 8 |
| D3 | ¿Partner se vende con precio de catálogo + asientos, o sólo negociado? | Catálogo $249 + $49 por login extra en Paddle, negociado sólo por excepción | 5, 8 |
| D4 | ¿El límite de leads es duro o blando? | Blando con aviso al 80% y bloqueo de altas nuevas al 110% | 6 |
| D5 | ¿Qué pasa al vencer la prueba sin pago? | Modo degradado automático al día 15 (ya existe la regla de acceso) | 6, 8 |
| D6 | Envíos masivos de A&J con Resend Free (100/día) | Repartir el envío en días o que A&J suba de plan; decidir con A&J | 3 |
| D7 | ¿Crédito prepagado o auto-recarga en Anthropic y Google? | Auto-recarga con tope mensual, y el panel vigila el gasto | 9 |

## Registro

Anota aquí, con fecha, lo que una fase descubrió y cambia a otra.

- 2026-11-18 — Plan creado a partir del análisis del sistema (PDF local
  `out/ITMANO-mapa-del-sistema.pdf`, no versionado).
- 2026-11-18 — Fase 1: el SDK de Resend lee `process.env.RESEND_API_KEY` (la
  cuenta de A&J) cuando recibe una llave vacía. Cualquier cliente nuevo de
  Resend (fase 3: hook de Auth, wrapper de cuotas) debe crearse con
  `resendForAccount`, nunca con `new Resend()` directo.
- 2026-11-18 — Fase 1: nunca ha entrado una respuesta de lead (Resend Inbound
  sin configurar). La tarea de llaves inbound pasó a la fase 3.
- 2026-11-18 — Fase 1: los tokens de CONDUIT vencieron el 2026-11-15. Si
  CONDUIT sigue activo, hay que emitir tokens nuevos.
