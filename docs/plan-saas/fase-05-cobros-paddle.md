# Fase 5 — Cobros con Paddle Live

**Objetivo:** que un cliente pueda pagar, cambiar de plan, actualizar su
tarjeta y cancelar solo, en producción.

Diseño existente: `docs/superpowers/specs/2026-07-27-paddle-billing-design.md`
y su plan. El código ya está; falta la configuración Live y lo que el
autoservicio añade.

## Decisiones previas

- **D3** — Partner autoservicio: precio de catálogo $249 + $49 por login extra
  como cantidad en Paddle, y precio negociado (`paddle_price_id`) sólo por
  excepción.

## Tareas

- [ ] Dylan: cuenta Paddle Live verificada, productos y precios (Esencial y
      Growth mensual/anual; Partner base + asiento si D3 = sí), destino de
      webhook `https://app.itmano.com/api/webhooks/paddle` y las 8 variables
      `PADDLE_*` en Vercel producción. Lista exacta en `.env.example`.
- [ ] Partner con asientos: añadir `PADDLE_PRICE_PARTNER_*` y
      `PADDLE_PRICE_PARTNER_SEAT_*`, y sincronizar la cantidad de asientos con
      los logins activos (cambio de cantidad en Paddle al invitar o quitar).
- [ ] Portal de cliente de Paddle para tarjeta, facturas y cancelación,
      enlazado desde Configuración → Suscripción.
- [ ] Prueba de punta a punta en Paddle sandbox: alta, upgrade, downgrade,
      pago fallido (`past_due`), cancelación programada y reactivación.
      Verificar cada transición en `subscriptions` y en el banner.
- [ ] Recordatorio de rotación de `PADDLE_API_KEY` (90 días) en
      `provider_settings` (fase 2).
- [ ] Primer cobro real con una tarjeta de Dylan y reembolso inmediato.

## Criterio de terminado

Un tenant de prueba en producción compra Esencial, sube a Growth, cancela y
reactiva sin intervención manual, y el panel lo refleja.
