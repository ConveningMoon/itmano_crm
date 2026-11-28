# Fase 5 — Cobros con Paddle Live

**Objetivo:** que un cliente pueda pagar, cambiar de plan, actualizar su
tarjeta y cancelar solo, en producción.

Diseño existente: `docs/superpowers/specs/2026-07-27-paddle-billing-design.md`
y su plan. Plan de tareas de esta fase:
`docs/superpowers/plans/2026-11-20-saas-fase-05-paddle.md` (local: `docs/superpowers/` no se versiona; las decisiones que importan están en este archivo).

## Decisiones

- **D3 (2026-11-20, Dylan):** Partner autoservicio con precio de catálogo
  $249/mes + $49/mes por login extra como cantidad en Paddle. El precio
  negociado (`subscriptions.paddle_price_id`) queda sólo por excepción.
- Cambio de plan con **prorrateo inmediato** en las dos direcciones: subir
  cobra la diferencia ahora; bajar deja crédito para los próximos cobros. El
  cliente ve el importe que calcula Paddle antes de confirmar.
- Cancelar es **al final del período pagado** y se puede reactivar hasta esa
  fecha.

## Tareas

Rama `feat/saas-fase-05-paddle`.

- [x] Partner de catálogo: `PADDLE_PRICE_PARTNER_{MONTH,YEAR}` y
      `PADDLE_PRICE_PARTNER_SEAT_{MONTH,YEAR}`. El checkout arma base +
      asientos (`subscriptionItems`, `src/lib/paddle/items.ts`); un precio
      negociado sustituye al catálogo y no cobra asientos.
- [x] Asientos sincronizados con los logins: al dar acceso, quitarlo o borrar
      un agente (`scheduleSeatSync`) y en la pasada diaria de
      `billing-lifecycle`, que corrige cualquier llamada fallida.
- [x] Autoservicio en Configuración → Suscripción (`src/lib/paddle/manage.ts`,
      reglas en `src/lib/paddle/self-service.ts`): cambiar de plan o de ciclo
      con vista previa del cobro, cancelar al final del período y reactivar. El
      estado lo sigue escribiendo sólo el webhook. Exentos, Partner con precio
      acordado y equipos sin suscripción de pago siguen por solicitud.
- [x] El webhook toma el precio que no es asiento (Paddle no garantiza el orden
      de los ítems) y, si es de catálogo, el plan sale del precio.
- [x] Portal de cliente de Paddle ("Gestionar tarjeta y facturas"), sólo cuando
      el equipo ya es cliente de Paddle.
- [x] Checkout **inline** en `/pago` con el diseño del CRM (sección abajo):
      "Pagar ahora" crea la transacción en el servidor y navega a
      `/pago?_ptxn=<id>&desde=crm`; al completar vuelve a
      `/settings?tab=cuenta`.
- [ ] **Dylan** — estilos del formulario de Paddle (paso 4, abajo), en sandbox
      y en Live.
- [ ] **Dylan** — prueba de punta a punta en Paddle **sandbox** (pasos abajo).
- [ ] **Dylan** — Paddle Live (pasos abajo).
- [ ] **Dylan** — fecha de vencimiento de `PADDLE_API_KEY` en
      `/admin/operacion` → Paddle → "Vence la llave". El calendario avisa a 14
      y 3 días.
- [ ] **Dylan** — primer cobro real con tu tarjeta y reembolso inmediato.

## Pasos de Dylan

### 1. Catálogo en Paddle (sandbox primero, luego Live)

Sandbox y Live son cuentas separadas: repite esto en cada una y usa sus ids.

1. Catalog → Products: un producto por plan (Esencial, Growth, Partner) y uno
   "Login adicional Partner".
2. Precios recurrentes en USD, mensual y anual (el anual cobra 10 meses):

   | Producto | Mensual | Anual |
   |---|---|---|
   | Esencial | $59 | $590 |
   | Growth | $129 | $1,290 |
   | Partner | $249 | $2,490 |
   | Login adicional Partner | $49 | $490 |

   En el de "Login adicional", permite cantidad mayor que 1.
3. Developer Tools → Notifications → destino
   `https://<dominio>/api/webhooks/paddle` con todos los eventos
   `subscription.*`.
4. Carga las 12 variables de `.env.example` (sección Paddle) en el proyecto de
   Vercel que corresponda. Sandbox: `itmano-crm-sandbox` con
   `NEXT_PUBLIC_PADDLE_ENV=sandbox`. Live: `itmano-crm` con
   `NEXT_PUBLIC_PADDLE_ENV=production`. Las llaves con `--sensitive`, por
   ejemplo:
   `vercel env add PADDLE_API_KEY production --project itmano-crm --scope james-dylans-projects --sensitive`
5. Redespliega.

### 2. Prueba de punta a punta (sandbox)

Con un tenant de prueba en prueba gratuita, en el despliegue sandbox y con la
tarjeta de prueba de Paddle (`4242 4242 4242 4242`):

1. Pagar Esencial mensual → la tarjeta muestra "Activa" y "Mensual".
2. Cambiar de plan → Growth: aparece el cobro prorrateado; confirmar → el plan
   pasa a Growth en segundos.
3. Cambiar a anual: mismo flujo.
4. Cancelar → aparece "Tu suscripción termina el …" → Reactivar → desaparece.
5. Partner: subir a Partner con 4 logins → Paddle muestra 1 asiento; invitar
   un quinto login → 2 asientos.
6. Pago fallido: en Paddle sandbox, simula un cobro fallido → estado "Pago
   pendiente"; actualizar tarjeta desde "Gestionar tarjeta y facturas".

### 3. Live

Igual que el paso 1 en la cuenta Live (cuenta verificada), y luego el primer
cobro real con tu tarjeta y su reembolso desde Paddle.

### 4. Estilos del checkout inline

El frame de Paddle no toma los estilos de la página: se configuran en Paddle →
**Checkout → Checkout configuration → pestaña Styling**, una vez en sandbox y
otra en Live. (También con `PATCH /checkout-styles`, pero exige el permiso
`checkout_settings.write`, que la API key actual no tiene a propósito.)

Generales (los dos modos):

| Ajuste | Valor | Por qué |
|---|---|---|
| Fuente | Fuente del sistema | Paddle sólo admite Lato o la del sistema; la del sistema queda más cerca de Inter |
| Tamaño de texto: inputs y botones | 14px | |
| Tamaño de texto: labels, enlaces y mensajes | 13px | |
| Posición de labels | Arriba, peso medio (500) | Como los formularios de Configuración |
| Altura de botones e inputs | 40px | |
| Grosor de bordes de botones e inputs | 1px | |
| Esquinas de botones | 8px | `.btn` |
| Esquinas de inputs | 9px | `.settings-input` |
| Ancho de botones | 100% | Paddle rechaza menos de 70% |
| Sombra de inputs | Desactivada | |
| Anillo de foco de botones | Activado | Su color no se puede cambiar |
| Padding del checkout | Activado | `/pago` asume el `min-width: 312px` que Paddle pide con padding |
| Color de marca (overall) | `#DDB968` | Sólo lo usa el overlay; se deja coherente |

Modo **oscuro** (`/pago` abre el checkout con `theme: 'dark'`; el modo claro
no se usa). El fondo del frame es transparente y deja ver el panel de la
página (`#111215`):

| Elemento | Fondo | Texto | Borde | Hover |
|---|---|---|---|---|
| Botón primario | `#DDB968` | `#0B0C0E` | `#DDB968` | fondo y borde `#B08D45`, texto `#0B0C0E` |
| Botón secundario | `#16181C` | `#E8E6E1` | `#2E2E31` | fondo `#1C1F24`, borde `#2E2E31`, texto `#E8E6E1` |
| Inputs | `#0B0C0E` | `#E8E6E1`, placeholder `#8A877F` | `#2E2E31` | — |
| Foco de inputs | — | — | `#DDB968` | sombra `rgba(221, 185, 104, 0.14)` (hex: `#28241B`) |
| Selector de método de pago | — | — | `#2E2E31` | — |
| Checkbox | `#DDB968` (marcado) | — | — | — |
| Labels | — | `#A09D95` | — | — |
| Enlaces | — | `#DDB968` | — | `#B08D45` |
| Mensaje de descuento | `#16181C` | — | `#2E2E31` | — |

Referencias del sistema de diseño: fondo `#0B0C0E` (`--bg-base`), tarjetas
`#16181C` (`--bg-elevated`), texto `#E8E6E1` y `#A09D95` (`--text-primary`,
`--text-secondary`), dorado `#DDB968` y `#B08D45` (`--gold-2`, `--gold-3`).
Los bordes `#2E2E31` son `--border-hover` (blanco al 12%) en hex sobre el
panel; si Paddle acepta `rgba`, usa `rgba(255, 255, 255, 0.12)`.

Lo que Paddle exige al checkout inline y ya cumple `/pago`: qué se compra,
subtotal, impuestos y total con moneda, cuánto y cada cuánto se renueva
(resumen propio armado con `checkout.loaded` y `checkout.updated`,
`src/lib/paddle/checkout-summary.ts`), el frame completo con su pie y el enlace
a `/reembolsos`. El "Default payment link" sigue siendo `https://<dominio>/pago`.

## Prueba en sandbox (2026-11-26)

Hecha por el agente en local contra Paddle sandbox, con el webhook en el
despliegue sandbox: pago de Esencial, subida a Growth, cambio a anual,
cancelación y reactivación, Partner con 4 y 5 logins (1 y 2 asientos, y bajada
a 0), portal y pago fallido simulado (pago pendiente → pausa → modo degradado).
Todo pasó. Correcciones que salieron de ahí (rama `fix/paddle-hallazgos`):

- Una suscripción **pausada** en Paddle ya no ofrece un checkout nuevo (crearía
  otra suscripción): la tarjeta ofrece "Reactivar suscripción", que la reanuda
  en Paddle (`resumePausedSubscription`).
- El checkout de Paddle deja cambiar la **cantidad** del plan. El CRM la
  devuelve a 1 en Paddle (`reconcileSubscriptionItems`): al recibir el webhook,
  al dar o quitar acceso y en la pasada diaria. Opcional en Paddle: limitar a 1
  la cantidad de los 6 precios de plan para que el selector ni aparezca.
- Checkout siempre en español (`locale: 'es'`), fechas con año cuando no son
  del año en curso, inversión anual en la tarjeta y eventos descartados por
  viejos marcados como procesados.

## Criterio de terminado

Un tenant de prueba en producción compra Esencial, sube a Growth, cancela y
reactiva sin intervención manual, y el panel lo refleja.
