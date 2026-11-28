# Fase 6 — Límites del plan en código

**Estado:** código hecho en `feat/saas-fase-06-limites` (2026-11-28);
migraciones aplicadas en sandbox y en producción (2026-11-28). Falta el PR.

**Objetivo:** un solo módulo de "derechos" (entitlements) que diga qué puede
hacer un tenant según su plan y estado, consultado por cada superficie en
servidor. Antes sólo se aplicaban el presupuesto de IA, el multi-login y el
tope de correos grupales.

## Decisiones (Dylan, 2026-11-28)

- **D4 — Leads:** límite blando. Aviso desde 80% del tope; bloqueo desde
  `ceil(1,1 × tope)` de altas manuales, importaciones (una importación que
  cruzaría el 110% se rechaza entera, indicando cuántas filas caben) y la API
  de agente. El intake de formularios, los webhooks y las respuestas de correo
  **nunca** se bloquean: perder un lead del cliente es peor que pasarse.
  Cuentan todas las filas de `leads` del tenant (no hay archivado).
- **D5 — Fin de la prueba:** degradación automática al día 15 sin pago, con
  aviso 3 días antes y el día del vencimiento (correo + banner). Estado nuevo
  `expired`. Una prueba vencida se trata como degradada al instante
  (`getTenantAccess` recibe `trialEndsAt`), sin esperar al cron.
- **Retención:** una prueba vencida sigue la misma política de 11 meses que
  una cuenta cancelada (aviso incluido).
- **Growth:** se corrige la promesa. Growth tiene 1 agente rastreado
  (`trackedAgents: 1`); crear más exige Partner. Si un Growth ya tuviera más,
  conserva los que tiene y no puede crear otros.
- **Dashboard:** Esencial y Growth ven todas las pestañas menos Agentes, que es
  de Partner (se muestra con adelanto y CTA). `features.fullAnalytics` se
  eliminó; queda `teamAnalytics`.

## Diseño

- `src/lib/subscriptions/entitlements.ts` (puro): plan + estado +
  `billingExempt` + `trialEndsAt` + uso → por derecho `{ allowed, limit, used,
  state: ok | warn | blocked }` con mensaje y CTA. Fuente: `PLANS` y
  `getTenantAccess`.
- `entitlements-server.ts`: `getTenantEntitlements` (con `cache()`) y
  `assertEntitlement(tenantId, key, opts)`, que devuelve `null` o
  `{ ok: false, error }`. Uso por tenant con conteos `head: true` en paralelo;
  correos por `sent_at` (misma ventana que la cuota).
- Topes: propiedades web 0 / 50 / ∞; leads 2.500 / 10.000 / ∞; correos al mes
  3.000 / 15.000 / 50.000; agentes rastreados 1 / 1 / ∞. IA de propiedades
  (PDF) sólo Growth y Partner.
- `billing_exempt` (A&J) → todo permitido. `super_admin` salta leads,
  publicación y agentes; no salta correos ni IA (cuestan dinero del tenant).
- **Correos:** cuentan todos los envíos corporativos a leads. Al 100% las
  automatizaciones (secuencias, por etiqueta, grupales, open houses
  automáticos, correo de compra disparado por el cron) paran; el envío humano
  (one-off) sigue hasta el 110%. Los runs de secuencia no se pierden: se
  reprograman al inicio del mes siguiente (`nextMonthStartUtc`, que además es
  el marcador de "pausado por cuota") y se reanudan al subir de plan.
- **Propiedades sobre el tope:** publicar más se bloquea de inmediato.
  `subscriptions.over_cap_since` marca la primera pasada del cron con
  publicadas > tope; a los 14 días (`GRACE_DAYS.properties`) se despublican las
  sobrantes (se conservan las más recientes, `unpublished_by_billing = true`).
  `restoreAfterReactivation` respeta el tope del plan actual.
- **Pantalla "Tu plan"** en Configuración: barra por límite con su estado,
  dentro de `<Suspense>` con skeleton. Sin `use cache` (lee sesión y base).

## Reglas que importan a otras fases

- La tabla `subscriptions` tiene el CHECK `subscriptions_trial_ends_at_coherent`
  (migración 055). Una fila `trial` o `expired` debe conservar `trial_ends_at`
  (`expired` lo usa como ancla de avisos y retención); cualquier escritura de
  estado debe respetarlo. La migración `20261128160000` lo relajó para
  `expired`.
- `trial` y `expired` salen sólo por el checkout de Paddle (o `super_admin`).
  Las solicitudes comerciales (cambio de plan, etc.) se rechazan en esos
  estados y la tarjeta oculta los botones. El `super_admin` sólo puede marcar
  `expired` desde `trial`/`expired`.
- **Fase 8:** toda ruta nueva que cree leads, publique propiedades o mande
  correo corporativo debe pasar por `assertEntitlement` / `assertEmailQuota`.
  El alta autoservicio no es excepción. El intake y los webhooks son lo único
  exento.
- **Test estático** `tests/billing/entitlement-gates.test.ts`: recorre `src/`
  y falla si un archivo inserta en `leads`, publica una propiedad o envía con
  la API de Resend sin pasar por la compuerta. Las excepciones (intake,
  webhooks, correos de plataforma, escritores del sistema) están en listas
  blancas comentadas; no se amplían para tapar un hueco, se pone el gate.
  La comprobación es **a nivel de archivo**: un segundo insert sin gate en un
  archivo que ya tiene otro gate pasa el test. La revisión de código cubre ese
  hueco.
- **Lecturas fallidas:** si la suscripción no se puede leer (`getSubscriptionRead`
  → `failed`), los gates fallan en abierto (como `getTenantAccessFor`) y
  `process-sequence-run` salta el tick sin reprogramar. Los conteos fallidos
  cuentan 0 y se registran (`tenant-usage`, `email-quota`).
- **Aviso previo a despublicar:** al marcar `over_cap_since` el cron inserta una
  notificación al tenant con la fecha (marca + 14 días) y cuántas se
  despublicarán; `/properties` y "Tu plan" muestran el mismo texto
  (`overCapNoticeText`).
- **Correo `pre_close` automático al 100 %:** se omite, no se reintenta. El
  orquestador sólo selecciona `closing_date = mañana`, así que al día siguiente
  ya no es candidato. Con el tope alcanzado ese aviso se pierde ese mes.
- Agent API: el tope de leads responde `ApiError('unprocessable', …)` con
  `reason: 'plan_limit'` (422); no existe un código `forbidden` y añadirlo
  cambia el contrato público.

## Lo que falta

- PR (lo abre Dylan). Las migraciones `20261128150000_fase06_limites.sql` y
  `20261128160000_fase06_prueba_vencida_coherente.sql` ya están en producción
  (2026-11-28; las filas existentes cumplían el CHECK y los advisors no
  muestran avisos nuevos).
- Primer cron en producción tras el despliegue: el tenant Esencial de pruebas
  (1 propiedad publicada) queda marcado por encima del tope y su propiedad se
  despublica a los 14 días, salvo que suba de plan.
- Seguimientos menores: "Tu plan" muestra "No incluido" en vez de la fecha de
  despublicación para un Esencial con propiedades publicadas (la fecha sí sale
  en /properties y en la campana); ante un error al leer la suscripción, "Tu
  plan" se muestra sin topes; el test del hub de IA sólo comprueba que no se
  llamó al gate.
- **Fotos por propiedad:** depende de la fase 4 (storage); fuera de esta fase.
- Menores anotados sin resolver: los conteos de correo no son atómicos entre
  invocaciones concurrentes (sobrepaso acotado); un Esencial degradado conserva
  hasta 3 propiedades publicadas (`min(plan, degradado)` no se aplica en el
  paso de degradación).

## Criterio de terminado

- Un tenant Esencial no puede publicar propiedades ni usar IA de propiedades,
  y lo entiende por el mensaje.
- Test de tabla: cada `(plan, estado)` contra cada derecho.
- La landing (`/planes`) y el código leen la misma fuente.
