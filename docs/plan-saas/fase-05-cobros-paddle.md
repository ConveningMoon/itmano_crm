# Fase 5 — Cobros con Paddle Live

**Objetivo:** que un cliente pueda pagar, cambiar de plan, actualizar su
tarjeta y cancelar solo, en producción.

Diseño existente: `docs/superpowers/specs/2026-07-27-paddle-billing-design.md`
y su plan. Plan de tareas de esta fase:
`docs/superpowers/plans/2026-11-20-saas-fase-05-paddle.md`.

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

## Criterio de terminado

Un tenant de prueba en producción compra Esencial, sube a Growth, cancela y
reactiva sin intervención manual, y el panel lo refleja.
