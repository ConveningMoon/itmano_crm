# Fase 3 — Correo: Magic Links, cuotas de Resend y crons

**Objetivo:** saber en todo momento cuánto queda de cada cuota de correo,
incluidos los Magic Links que manda Supabase, y que ningún envío falle en
silencio por un tope.

## Decisiones previas

- **D1** — Plan actual de la cuenta de Resend de ITMANO. Si es Free (100/día,
  3.000/mes, 1 dominio), un solo cliente Growth con su dominio ya no cabe y
  100 Magic Links + correos al día es poco para un SaaS. Recomendación: Pro
  ($20) antes del primer cliente nuevo.
- **D6** — A&J en Resend Free: un correo grupal o un open house grande pasa de
  100 en un día. Opciones: (a) A&J sube de plan, (b) el CRM reparte el envío
  en días cuando la cuenta del tenant es Free, (c) ambas.

## Tareas

### Magic Links medibles (Send Email Hook)

- [ ] Configurar el **Send Email Hook** HTTP de Supabase Auth hacia
      `POST /api/auth/send-email` (route handler: es un sistema externo).
      Verificar la firma con el secreto del hook (formato Standard Webhooks).
- [ ] La ruta envía con la cuenta de ITMANO y la identidad común aprobada, con
      plantillas propias por tipo (`magiclink`, `invite`, `email_change`,
      `recovery`), y registra cada envío en `email_sends` con un
      `send_type = 'auth'` nuevo y `tenant_id` nullable para auth (justificar)
      o en una tabla `auth_email_sends` propia. Preferir la tabla propia: no
      mezclar métricas de clientes con correos de plataforma.
- [ ] Probar primero en sandbox. En producción, cambiar de SMTP a hook en una
      ventana tranquila, con el SMTP configurado listo para volver.
- [ ] Revisar Authentication → Rate Limits: subir el límite de correos de
      Auth por hora de forma acorde al plan de Resend.

### Cuotas reales de Resend

- [ ] Wrapper único sobre `emails.send` y `batch.send` (ya existe el punto de
      instalación del guard en `src/lib/resend.ts`) que lea las cabeceras
      `x-resend-daily-quota` y `x-resend-monthly-quota` de cada respuesta y
      guarde el último valor por cuenta en `platform_metrics` (fase 2).
      Verificar en la doc de Resend que el SDK expone `headers` en la
      respuesta y en qué planes llega cada cabecera.
- [ ] Como respaldo cuando no llegan cabeceras (Pro no envía la diaria):
      contar `email_sends` + `auth_email_sends` del día y del mes por cuenta.
- [ ] Guardia antes de un envío masivo: si `destinatarios > cuota restante del
      día` de la cuenta, el envío se reparte en días (respetando las garantías
      de `batch-send.ts`) o se rechaza con un mensaje claro. Nunca dejar que
      Resend corte a mitad sin que el CRM lo sepa.
- [ ] Un 429 de cuota diaria deja el lote `pending` con el motivo visible (ya
      ocurre en open houses y grupales; extenderlo a secuencias y one-off).

### Crons en un solo lugar

- [ ] Mover `sequence-orchestrator` (cada hora) y `billing-lifecycle` (diario)
      de cron-job.org a `vercel.json`. Vercel manda `CRON_SECRET` en
      `Authorization`; ambos ya lo validan. Comprobar que aceptan `GET`.
- [ ] Desactivar los jobs de cron-job.org **después** de ver dos ejecuciones
      correctas en Vercel (latidos de la fase 2).
- [ ] Actualizar `docs/agents/environments.md` (sección de crons).

## Criterio de terminado

- Un Magic Link pedido en sandbox aparece en el panel y suma a la cuota.
- Forzando la cuota restante a 10, un grupal de 50 se reparte o se rechaza con
  un mensaje claro, sin enviar a medias.
- Los cuatro crons corren desde Vercel y tienen latido.

## Riesgos

- Con el hook, si la app falla, el login falla. Mitigación: alerta de la fase 2
  sobre errores 5xx de la ruta y procedimiento de vuelta a SMTP documentado.
