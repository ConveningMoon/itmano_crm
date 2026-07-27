# Diseño — Integración de Paddle Billing en ITMANO CRM

**Fecha:** 2026-07-27
**Rama:** `feat/paddle-billing`
**Fase del roadmap:** Comercialización → Billing / suscripciones
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 0. Resumen

ITMANO CRM cobra hoy sales-led sin procesador de pagos: la tabla `subscriptions`
(migraciones 054/055) es un registro operativo que administra el super_admin.
Este diseño conecta **Paddle Billing** (cuenta Live y Sandbox ya aprobadas) para
que el cliente pague por sí mismo desde el CRM, y define qué ocurre cuando deja
de pagar.

La adquisición **sigue siendo sales-led**. No se abre el signup público ni se
automatiza el provisioning de tenants: eso es la fase "Tenant onboarding" del
roadmap y queda fuera de alcance.

### Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Modelo de venta | Híbrido: adquisición sales-led, pago autoservicio dentro del CRM |
| Trial de 14 días | Se queda fuera de Paddle — sigue siendo operativo (super_admin) |
| Plan Partner | Precio fijo negociado por tenant; sin asientos (quantity) en Paddle |
| Enforcement al impago | Degradación gradual, no lockout |
| Moneda | Solo USD |
| Ciclo de facturación | Mensual + anual (2 meses gratis, 16.7%) |
| Impuestos | Tax-exclusive: se suman en el checkout |
| A&J Real Estate | `billing_exempt` — cortesía/piloto, nunca toca Paddle |

---

## 1. Hechos verificados de Paddle (2026-07-27)

Investigados contra la documentación oficial vigente, no desde memoria del modelo.

- SDKs vigentes: **`@paddle/paddle-node-sdk@3.8.0`** (servidor) y
  **`@paddle/paddle-js@1.6.4`** (wrapper de Paddle.js v2).
- Variables de entorno del patrón oficial: `PADDLE_API_KEY`,
  `PADDLE_NOTIFICATION_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_ENV`,
  `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
- **Webhooks:** header `Paddle-Signature` con formato `ts=…;h1=…`. Firma
  HMAC-SHA256 sobre la concatenación `ts:rawBody`. El SDK lo resuelve con
  `paddle.webhooks.unmarshal(rawBody, secret, signature)`, que además aplica una
  tolerancia de 5 segundos contra replay.
- **El body debe leerse crudo.** Cualquier parseo o reformateo previo invalida la
  firma.
- **Eventos:** `subscription.created` y `subscription.updated` bastan para
  provisionar y mantener el estado. No existen eventos separados para
  renovaciones, upgrades, downgrades ni cambios de estado — `subscription.updated`
  los cubre todos.
- **Entrega at-least-once:** el mismo evento puede llegar más de una vez → hay que
  deduplicar por `event_id`.
- **Sin garantía de orden:** hay que comparar `occurred_at` con el último valor
  guardado antes de aplicar un cambio.
- **`custom_data`** fijado en la transacción **se copia a la suscripción** cuando
  esta se crea. Es el puente para mapear `tenant_id`.
- **Restricción del checkout:** si se abre con `customer.id`, Paddle exige también
  los IDs de address y business. Esto motiva la decisión arquitectónica de §2.
- **Portal de cliente:** `POST /customers/{id}/portal-sessions` devuelve URLs
  autenticadas **de un solo uso y vida corta**. Se generan on-demand; nunca se
  cachean ni se persisten.
- **Estados de suscripción:** `trialing` y `active` → acceso completo; `past_due`
  → acceso completo más aviso; `paused` y `canceled` → revocar.
- **Sandbox y Live son cuentas separadas:** distintos IDs de producto/precio,
  distintas API keys, distintos client tokens, distintos endpoints de webhook.
  Nunca se mezclan.

---

## 2. Arquitectura del checkout

**Decisión: la transacción se crea en el servidor; el cliente abre el checkout
con `transactionId`.**

```
Owner en /settings pulsa "Activar plan Growth · anual"
  → server action:
      · lee el tenant de la sesión autenticada
      · resuelve el price id (estándar por env, o paddle_price_id del tenant si es Partner)
      · POST /transactions con custom_data { tenant_id }
      · devuelve el txn_…
  → cliente: Paddle.Checkout.open({ transactionId, settings: { theme: 'dark' } })
  → el cliente paga (Paddle es Merchant of Record y calcula el impuesto)
  → webhook subscription.created → se escribe la fila → el CRM queda activo
```

### Alternativa descartada

Pasar `items: [{ priceId }]` desde el navegador. Se descarta por tres razones:

1. **Partner tiene precio por trato.** El `pri_…` de cada Partner vive en su fila
   de `subscriptions`; solo el servidor lo conoce. Con `items` habría que
   exponerlo al navegador.
2. **El `tenant_id` no puede venir del cliente.** Se inyecta como `custom_data` al
   crear la transacción, server-side, desde la sesión autenticada.
3. **Evita la restricción de address/business** al pasar `customer.id`.

El cliente nunca elige el precio; solo pulsa un botón.

---

## 3. Catálogo en Paddle

Un producto por plan. Precios recurrentes separados por ciclo. **Tax-exclusive,
solo USD.**

| Producto | Mensual | Anual | Ahorro |
|---|---|---|---|
| ITMANO CRM — Esencial | $59 / mes | $590 / año | $118 |
| ITMANO CRM — Growth | $129 / mes | $1,290 / año | $258 |
| ITMANO CRM — Partner | creado por trato | creado por trato | — |

**Gancho comercial:** "2 meses gratis" (16.7%). Se descarta un descuento mayor:
en Growth el presupuesto de IA es $30/mes = $360/año contra $1,290 de ingreso
(28% del revenue como COGS), y en un posicionamiento premium un 25% off lee como
liquidación.

**No se publica un equivalente mensual del anual.** $590 ÷ 12 = $49.17; redondear
a "$49/mes" prometería menos de lo que se cobra, y `plans.ts` ya fija la
convención de *"redondeados hacia abajo para nunca prometer de más"*. El titular
es el total anual; el gancho es "2 meses gratis · ahorras $118".

### Creación del catálogo

Script versionado `scripts/paddle-catalog.ts`, ejecutable contra la API con
`--env=sandbox|live`. Motivo: sandbox y live deben salir idénticos y el catálogo
debe ser auditable en git, no una secuencia irrepetible de clics.

Precios Partner: el mismo script con flags
(`--partner --tenant=<id> --monthly=349 --annual=3490`). El `pri_…` resultante lo
pega el super_admin en el Centro de control.

Los IDs de los 4 precios estándar viven en variables de entorno
(`PADDLE_PRICE_ESENCIAL_MONTH`, `PADDLE_PRICE_ESENCIAL_YEAR`,
`PADDLE_PRICE_GROWTH_MONTH`, `PADDLE_PRICE_GROWTH_YEAR`). Es lo único, junto a las
credenciales, que cambia entre sandbox y live: **el go-live no toca código**.

---

## 4. Modelo de datos — migración `070_paddle_billing.sql`

> Numeración: `070` está libre. Observado y **no corregido** (fuera de alcance):
> no existe `065_*.sql` aunque el código lo referencia, y hay dos migraciones
> `069` (`069_ai_briefings.sql` y `069_carousel_pillar.sql`).

### 4.1 Columnas nuevas en `subscriptions`

```sql
billing_cycle          text check (billing_cycle in ('month','year'))  -- null hasta que haya pago
paddle_customer_id     text
paddle_subscription_id text unique
paddle_price_id        text          -- precio contratado; imprescindible para Partner
current_period_end     timestamptz   -- "renueva el 12 de marzo de 2027"
cancel_at              timestamptz   -- cancelación agendada a fin de período
billing_exempt         boolean not null default false  -- A&J: cortesía
degraded_at            timestamptz   -- inicio del modo degradado; ancla los plazos de 14 y 60 días
last_event_at          timestamptz   -- descarta webhooks desordenados
```

El `CHECK` de `status` se amplía con `past_due` y `paused`. Los valores
`cancel_requested` y `change_requested` **se conservan**: siguen sirviendo para
Partner, que es negociado y no se compra con un botón.

### 4.2 Tabla nueva `paddle_webhook_events`

```sql
event_id     text primary key   -- deduplicación del at-least-once
event_type   text not null
occurred_at  timestamptz not null
tenant_id    text              -- nullable: puede no resolverse
payload      jsonb not null
processed_at timestamptz
```

Doble función: idempotencia y traza de auditoría para cuando un cobro no cuadre.
RLS: solo `super_admin`.

### 4.3 Columna nueva en `properties`

```sql
unpublished_by_billing boolean not null default false
```

**Imprescindible.** Sin ella, al reactivar no se puede distinguir una propiedad
que despublicó el sistema por impago de una que el cliente despublicó a propósito
— y se le republicaría una casa vendida. Con ella, la reactivación republica
exactamente el conjunto que tocó el sistema.

### 4.4 Nota operativa

El MCP de Supabase requiere autorización y esta sesión no puede completar el flujo
OAuth. La migración se entrega como archivo SQL en `supabase/migrations/` (el
patrón del repo) y se aplica con la CLI de Supabase o desde el dashboard.

---

## 5. Webhook — `src/app/api/webhooks/paddle/route.ts`

Sigue el patrón del webhook de Resend ya existente. Cuatro reglas no negociables:

1. **Body crudo:** `await request.text()`, nunca `request.json()`.
2. **Verificar antes de confiar:** `paddle.webhooks.unmarshal(raw, secret, signature)`;
   si lanza → `401` y fin.
3. **Idempotencia por `event_id`:** insert en `paddle_webhook_events`; si el ID ya
   existe → `200` y salir sin efectos.
4. **Orden:** si `occurred_at <= subscriptions.last_event_at`, el evento se
   registra pero **no se aplica**.

Eventos suscritos: `subscription.created`, `subscription.updated`,
`subscription.canceled`, `transaction.completed`.

### Mapeo de estados

| Paddle | CRM `status` | Acceso |
|---|---|---|
| `trialing` | `active` | completo |
| `active` | `active` | completo |
| `past_due` | `past_due` | **completo** + banner al portal |
| `paused` | `paused` | degradado |
| `canceled` | `cancelled` | degradado |

**Regla crítica:** la degradación se dispara por `paused`/`canceled` **reales**,
nunca por la intención de cancelar. Al cancelar un plan anual, Paddle deja
`status = active` con un `scheduled_change` a fin de período: el cliente pagó 12
meses y los usa completos. Degradar al recibir la cancelación le cortaría el
servicio a alguien que ya pagó. Este es el error clásico de las integraciones de
billing y tiene test propio (§9).

---

## 6. Modo degradado

### 6.1 El helper único — `src/lib/subscriptions/access.ts`

`getTenantAccess(subscription)` devuelve un objeto y **toda la app consulta solo
ese objeto**. La regla vive en un archivo, no repartida por la base de código.

```ts
interface TenantAccess {
  canUseAi:               boolean
  canCreateSequences:     boolean
  sequencesRunnable:      boolean
  customDomainAllowed:    boolean
  monthlyEmailQuota:      number | null   // null = sin límite
  publishedPropertiesCap: number | null   // null = el del plan
  banner:                 { tone: 'amber' | 'red'; message: string; cta: string } | null
}
```

`billing_exempt = true` (A&J) devuelve siempre acceso completo, sin importar el
estado.

**El modo degradado NO es solo-lectura.** Una versión anterior de este diseño
contemplaba un flag `canWrite`; queda descartado. El tenant degradado sigue
creando y editando leads, notas, propiedades y agentes con normalidad — lo que se
corta es exclusivamente aquello que le cuesta dinero a ITMANO (IA, envíos por
Resend, slot de dominio) o que constituye entrega de valor continua (propiedades
publicadas a la web). Un CRM que no deja escribir no es un CRM degradado, es un
CRM roto, y destruye la posibilidad de recuperar al cliente.

**Ciclo de `degraded_at`:** se fija con `now()` en la transición a
`paused`/`cancelled` si aún es `null`; se limpia a `null` al volver a `active`.
Es el ancla de los plazos de 14 y 60 días, por lo que nunca se toca en las
transiciones intermedias.

### 6.2 Límites

| Recurso | Growth activo | Degradado (`paused` / `cancelled`) |
|---|---|---|
| IA (redacción, bootstrap, intake PDF) | $30/mes | **0 — apagada por completo** |
| Dominio propio de envío | ✅ | **Revocado → dominio compartido de ITMANO** |
| Envíos corporativos (Resend) | 15,000/mes | **200/mes** |
| Composer modo Personal (`mailto:`) | ✅ | **✅ ilimitado** |
| Secuencias automáticas | ✅ | **Runs pausados, sin nuevas inscripciones** |
| Crear secuencias nuevas | ✅ | **Bloqueado** |
| Propiedades publicadas a la web | 50 | **3** |
| Leads, import, **export** | ✅ | **✅ sin límite** |

**Por qué 200 envíos corporativos, y por qué la regla cualitativa importa más que
el número.** Resend en el plan de $20 son 50,000/mes; 200 es el 0.4%, y con 20
tenants dormidos se gasta el 8% — está acotado. Pero el número por sí solo no
protege: una secuencia puede quemar los 200 en un minuto desde una cuenta que
nadie supervisa, y eso daña la reputación del **dominio compartido que usan todos
los demás tenants**. Por eso la regla real es cualitativa: **envío humano sí,
automatización no.** 200/mes son ~7 al día: suficiente para contestar leads uno a
uno, inservible para una campaña.

**Por qué el modo Personal del composer no lleva límite.** El composer de
`leads/[id]/send-email-modal.tsx` ya tiene dos modos: *Corporativo* (sale por
Resend) y *Personal* (abre un `mailto:` con asunto y cuerpo prellenados — "No pasa
por el CRM"). El modo Personal **no consume Resend, no cuesta nada y no arriesga
la reputación del dominio compartido**. Queda ilimitado incluso con la suscripción
cancelada. Resultado: un tenant degradado conserva un CRM plenamente funcional
para leer su pipeline y contactar leads desde su propio correo. El redactor de IA
del composer sí queda apagado: escriben el texto ellos.

**Dónde se cuenta la cuota de 200.** Envíos con `email_sends.sent_at` dentro del
mes calendario en curso para el tenant. El chequeo va en los servicios de envío,
antes de llamar a Resend — mismo patrón que el gate de `ai-limit.ts`.

**Por qué crear secuencias se bloquea en vez de capearse a N.** Un tope numérico
de secuencias no ahorra nada: el costo es el envío, no la fila en la tabla. Y
dejar crear "una más" invita a que el tenant degradado prepare campañas que no
puede ejecutar. Bloquear la creación es más honesto y más simple: las que ya
existen se conservan íntegras y editables.

**Por qué 3 propiedades publicadas y no 0.** La web pública es el activo del
cliente, no de ITMANO. Vaciarla le rompe el sitio a alguien que quizá se recupere
en dos meses: es hostil y quema la relación. Tres mantiene el sitio
estructuralmente vivo y evidentemente degradado. La presión existe sin ser
destructiva.

### 6.3 Revocación del dominio propio

**No se toca `tenants.email_from_address` ni `domain_status`.** El override ocurre
en la resolución, no en la base de datos.

`resolveSenderIdentity()` en `src/lib/services/sender-identity.ts` es un **único
punto de paso**: los cuatro servicios de envío (`process-sequence-run`,
`send-one-off-email`, `send-purchase-email`, `send-sequence-email`) resuelven ahí
el remitente **en el momento del envío**. Se le añade un parámetro:

```
resolveSenderIdentity(tenant, { customDomainAllowed })
  → si !customDomainAllowed → fuerza "<slug>@mail.itmano.com" y account = 'itmano'
```

Forzar el compartido debe forzar también `account = 'itmano'`: un `from` de
`mail.itmano.com` no está verificado en la cuenta Resend de A&J.

**Consecuencia clave de no nulificar la columna:** el webhook inbound de Resend
resuelve el tenant comparando el `to` del reply contra `tenants.email_from_address`
(`src/app/api/webhooks/resend/route.ts`). Si se borrara ese campo, las respuestas a
conversaciones ya en vuelo dejarían de asociarse a su lead. Con el override, el
cliente degradado **sigue recibiendo las respuestas de los emails que ya mandó**.
Reactivar es quitar el override: instantáneo, cero DNS.

**Nada que migrar en las secuencias existentes.** Las secuencias nunca guardaron
un dominio; la identidad se resuelve al enviar. Cambiar el override cambia el
remitente de las secuencias viejas, las nuevas, los one-off y los emails de
proceso de compra a la vez.

### 6.4 El slot de Resend — liberación diferida

| Momento | Acción |
|---|---|
| Al degradar | El envío pasa al dominio compartido. **El dominio sigue registrado en Resend** |
| Días 1–60 | Reactivación instantánea. Los replies entrantes a su dominio siguen llegando |
| Día 60 | Se elimina el dominio de Resend → slot liberado. Email al cliente: puede quitar los registros DNS; reactivar requerirá re-verificar |

Borrar el dominio el día 1 liberaría el slot antes, pero rompe los replies en
vuelo y convierte la reactivación en 24–48h de propagación DNS. En un modelo
sales-led donde se quiere recuperar al cliente, esos 60 días valen más que el
slot.

### 6.5 Datos preexistentes por encima del límite

**Propiedades.** Ventana de gracia de **14 días** desde `degraded_at` en la que el
owner elige cuáles 3 quedan publicadas. Si no actúa, regla determinista: **se
conservan las 3 con `updated_at` más reciente** y el resto pasa a
`published_to_web = false` con `unpublished_by_billing = true`. Es **no
destructivo**: la fila, las fotos, las descripciones y el slug quedan intactos.

**Secuencias.** Sin recorte retroactivo, no se borra ninguna: están escritas con
la voz del cliente y borrarlas sería hostil. Se pausan los runs activos
(`lead_sequence_runs.status = 'paused'`) y se bloquea crear más.

> **La trampa de la reactivación:** reanudar un run pausado hace tres meses envía
> el "paso 3" a un lead que no sabe nada del agente desde enero — malo para el
> cliente y malo para la deliverability. **Regla:** al reactivar, los runs pausados
> **más de 30 días se marcan `completed`**, no se reanudan; el owner re-inscribe a
> quien quiera, deliberadamente. Los pausados ≤30 días reanudan con `next_send_at`
> corrido.

**Dominio.** Nada que migrar (§6.3).

### 6.6 Reactivación

Al volver a `active`: se quita el override de dominio; se republican **solo** las
propiedades con `unpublished_by_billing = true` (hasta el cap del plan) y se
limpia el flag; los runs se resuelven según la regla de los 30 días; se restaura
el presupuesto de IA del plan.

---

## 7. Superficies de UI

| Dónde | Qué cambia |
|---|---|
| `/planes` (marketing) | Toggle **Mensual / Anual** con "2 meses gratis". Nota "los impuestos se calculan en el checkout". El CTA sigue siendo "Contáctanos" — la adquisición no cambia |
| `/settings` → Suscripción | Plan, ciclo, fecha de renovación. Botones **Activar / Cambiar plan** (checkout overlay) y **Gestionar pago y facturas** (portal de Paddle) |
| Layout `(dashboard)` | Banner de estado según `getTenantAccess().banner` |
| `/admin` (Centro de control) | Por tenant: estado real de Paddle, `paddle_price_id` (para Partner), toggle `billing_exempt`, enlace a la suscripción en el dashboard de Paddle |

**Partner en `/settings`.** El botón de pago aparece **solo si el tenant tiene
`paddle_price_id`** — que para Partner lo fija el super_admin tras cerrar el trato.
Sin ese campo, el owner ve el flujo de solicitud actual
(`requestSubscriptionChange`, estado `change_requested`, aviso a ITMANO). Es decir:
Esencial y Growth se compran con un botón; Partner se negocia primero y se paga
con el mismo botón después. Los estados `change_requested` y `cancel_requested`
conservan así su razón de existir.

`plans.ts` gana `priceAnnualUsd` e `inversionAnual` por plan. Sigue siendo la
fuente única y client-safe.

El portal de Paddle ahorra construir pantallas de tarjeta, facturas y cancelación.
Su URL se genera en un server action **on-demand**, nunca se cachea ni se guarda.

---

## 8. Cron de ciclo de vida — `/api/cron/billing-lifecycle`

Diario, sobre la infraestructura de cron-job.org ya existente. Los plazos de 14 y
60 días no los dispara ningún webhook.

1. Tenants degradados con `degraded_at` de hace ≥14 días y propiedades publicadas
   por encima del cap → aplicar la regla determinista de §6.5.
2. Tenants degradados con `degraded_at` de hace ≥60 días y dominio propio aún
   registrado → eliminar el dominio de Resend, notificar al cliente.
3. Tenants cancelados hace ≥11 meses → aviso de retención (§10.2).

Idempotente: dos ejecuciones del mismo día producen el mismo resultado.

---

## 9. Testing — `npm run test:billing`

Suite Vitest nueva, sin red: se le pasan payloads de webhook fijos al reductor.

- Firma inválida → `401`, sin efectos.
- `event_id` repetido → un solo efecto.
- `occurred_at` anterior al último → registrado, no aplicado.
- Cada transición de estado → acceso correcto en `getTenantAccess`.
- **Anual cancelado con `cancel_at` futuro → acceso completo** (la trampa de §5).
- `billing_exempt` → acceso completo sin importar el estado.
- Degradado → `resolveSenderIdentity` devuelve el dominio compartido y
  `account = 'itmano'`.
- Reactivación → se republican solo las propiedades con
  `unpublished_by_billing = true`.
- Reactivación → runs pausados >30 días quedan `completed`, ≤30 días reanudan.

Paddle ofrece además un **simulador de webhooks** en el dashboard, que dispara
eventos reales contra el endpoint de sandbox sin completar checkouts a mano.

---

## 10. Decisiones de producto asociadas

### 10.1 La exportación nunca se bloquea

Un cliente que dejó de pagar debe poder sacar sus leads en CSV siempre. Cuesta
cero, es un argumento de venta real ("tus datos no quedan secuestrados") y con
clientes en la UE (TECNOCASA, Barcelona) la portabilidad de datos es una
obligación de GDPR, no una cortesía.

### 10.2 Política de retención

Hoy no existe. Un tenant cancelado no puede vivir para siempre: cuesta storage y
es pasivo legal. **12 meses** desde la cancelación, aviso por email al mes 11,
después borrado. Debe quedar redactado en `/terminos`.

### 10.3 Comunicación

- Email al cliente al degradar: qué cambió, qué se conserva, cómo reactivar.
- Aviso a ITMANO por bell + Telegram en cada degradación. En un modelo sales-led,
  alguien debería llamar antes de que la cuenta se pudra.
- Reactivación en un clic desde el banner → checkout → restauración automática.

### 10.4 No degradar en `past_due`

Se deja que Paddle Retain haga el dunning primero. Un fallo de tarjeta no es un
impago.

---

## 11. Sandbox → Live

Cuentas totalmente separadas. **El go-live cambia variables de entorno en Vercel,
no código** — de ahí que los price IDs vivan en env.

Checklist de la cuenta Live:

- Verificación del dominio `app.itmano.com` (Live rechaza `localhost`).
- Default payment link.
- Métodos de pago.
- Moneda de balance y datos de payout.
- Paddle Retain activado para dunning.
- Notification destination nueva apuntando a la URL de producción, con su propio
  `PADDLE_NOTIFICATION_WEBHOOK_SECRET`.
- Recrear el catálogo con `scripts/paddle-catalog.ts --env=live`.

---

## 12. Lo que hace falta del lado de Dylan

**Sandbox (para desarrollar):** `PADDLE_API_KEY`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_NOTIFICATION_WEBHOOK_SECRET` y el
Seller ID.

**Live (para el go-live):** los mismos cuatro de la cuenta Live, más el checklist
de §11.

Las credenciales las coloca Dylan en `.env.local` y en Vercel (Preview y
Production). **No se pasan por chat ni se commitean**; el código solo referencia
nombres de variable. `.env.example` lista los nombres, nunca los valores.

**Confirmación pendiente (bloquea el go-live, no el trabajo en sandbox):** que la
cuenta Paddle aprobada esté a nombre de la misma entidad UAE (Dubái) que figura
con placeholders en `/terminos`. Si no coinciden, las páginas legales deben
corregirse antes del primer cobro real.

---

## 13. Fuera de alcance

- Signup público abierto.
- Provisioning automático de tenants (fase "Tenant onboarding" del roadmap).
- Asientos Partner (quantity) en Paddle.
- Trial dentro de Paddle.
- A&J en cobro (`billing_exempt`).
- Redacción legal de `/reembolsos` con la cláusula anual y de `/terminos` con la
  política de retención — es trabajo de Dylan y su abogado, no del código.
- Configuración de Paddle Retain más allá de activarlo.
- Corregir la numeración de migraciones (`065` ausente, `069` duplicada).
