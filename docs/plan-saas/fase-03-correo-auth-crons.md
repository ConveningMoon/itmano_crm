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

Rama `feat/saas-fase-03-correo` (sale de `feat/saas-fase-02-panel`). Plan de
tareas: `docs/superpowers/plans/2026-11-19-saas-fase-03-correo.md` (local: `docs/superpowers/` no se versiona; las decisiones que importan están en este archivo).

### Magic Links medibles (Send Email Hook)

- [x] Ruta `POST /api/auth/send-email` (route handler: sistema externo). Verifica
      la firma Standard Webhooks con `svix` y `SEND_EMAIL_HOOK_SECRET`
      (`v1,whsec_…` tal como lo da Supabase). Latido `webhook:auth-email`.
- [x] Envía por `resendForAccount('itmano')` desde `AUTH_EMAIL_FROM` (por
      defecto `ITMANO <acceso@mail.itmano.com>`), con plantillas propias por tipo
      (`magiclink`/`signup`, `invite`, `recovery`, `email_change` con los dos
      correos del cambio seguro). El enlace va a `/auth/callback?token_hash=…`,
      el mismo flujo de `verifyOtp` que ya usaba el login. Los avisos
      `*_notification` no se envían (no están activados).
- [x] Tabla propia `auth_email_sends` (sin la dirección del destinatario: basta
      el `user_id`), no `email_sends`: no mezcla correos de plataforma con las
      métricas de los clientes.
- [ ] **Dylan** — probar en sandbox y cambiar producción (pasos abajo).
- [ ] **Dylan** — Authentication → Rate Limits: subir los correos de Auth por
      hora acorde al plan de Resend (D1).

### Cuotas reales de Resend

- [x] El SDK 6.12 expone `headers` en cada respuesta. `installQuotaTracking`
      (`src/lib/email/quota-tracking.ts`) envuelve `emails.send` y `batch.send`
      de cada cliente en `src/lib/resend.ts`, por fuera del guard de envíos:
      cuenta los correos aceptados de verdad por cuenta y día
      (`resend_usage_daily`) y guarda las cabeceras `x-resend-daily-quota`
      (sólo plan Free) y `x-resend-monthly-quota` y el último 429 de cuota
      (`resend_quota_state`), todo con la RPC `record_resend_send`.
      Desviación del plan: no se escribe en `platform_metrics` en cada envío
      (sería una fila por correo); la foto diaria del cron sigue ahí.
- [x] Respaldo sin cabeceras: el contador propio cuenta todos los caminos de
      envío (secuencias, grupales, open houses, one-off, avisos y Magic Links).
      La cuota restante usa el mayor de contador y cabecera
      (`quotaRemaining`, `src/lib/email/quota.ts`) contra la cuota anotada en
      `provider_settings`.
- [x] Guardia en grupales y open houses: al empezar se lee la cuota
      (`resend_quota_status`) y cada lote se recorta a lo que queda
      (`quotaBudget`). Lo que no cabe queda `pending` con un mensaje claro
      ("Salieron N; quedan M en espera…") y el orquestador horario lo retoma en
      el siguiente periodo, con la misma Idempotency-Key por lote. Sin cuota
      anotada no limita: el 429 de Resend sigue siendo la última barrera.
- [x] Un 429 de cuota ya no se confunde con uno de velocidad: grupales y open
      houses quedan en espera con el motivo; una secuencia se **pospone** al
      siguiente día o mes UTC en vez de pausarse (antes había que reactivarla a
      mano); un one-off devuelve un mensaje claro.
- [x] Panel: la tarjeta de Resend usa la fuente más alta (contador, cabecera o
      `email_sends` + Magic Links), muestra los Magic Links del día y del mes y
      se pone en rojo si Resend rechazó por cuota.

### Respuestas de leads (Resend Inbound)

⏸ Configuración y una decisión de Dylan; el código ya existe
(`matchInboundTenant`, webhook de Resend). Ver "Decisión pendiente D8".

- [ ] Decidir la dirección de respuesta de cada identidad (D8).
- [ ] Configurar Resend Inbound y sus registros MX en `mail.itmano.com`
      (cuenta de ITMANO). Con A&J, sólo según D8.
- [ ] Dylan crea una llave de solo lectura en cada cuenta y la carga él mismo,
      sin pasar el valor por un agente:
      `vercel env add RESEND_INBOUND_API_KEY_ITMANO production --project itmano-crm --scope james-dylans-projects --sensitive`
      (y `RESEND_INBOUND_API_KEY` para A&J). Luego, redesplegar.
- [ ] Prueba real: responder a un correo de una secuencia de sandbox o a
      `delivered@resend.dev`, y verlo en la ficha del lead.

### Crons en un solo lugar

- [x] `sequence-orchestrator` (cada hora, `0 * * * *`) y `billing-lifecycle`
      (diario, `0 6 * * *`) en `vercel.json`. El orquestador acepta ahora `GET`
      además de `POST`; `billing-lifecycle` ya aceptaba `GET`. Ambos validan
      `CRON_SECRET`, que Vercel manda en `Authorization`.
- [x] En sandbox también corren (Vercel Cron programa los dos proyectos): sus
      correos se simulan por el guard y `billing-lifecycle` sólo toca la base
      del sandbox. No hay efecto externo.
- [ ] **Dylan** — desactivar los dos jobs de cron-job.org **después** de ver
      dos ejecuciones correctas en Vercel (latidos en `/admin/operacion`).
      Mientras convivan, el orquestador corre dos veces por hora: es seguro
      (claims optimistas e Idempotency-Key), sólo duplica trabajo.
- [x] `docs/agents/environments.md` (sección de crons y del hook).

## Pasos de Dylan

### Probar el hook en sandbox (después del merge a `main`)

El hook necesita una URL pública estable: la de producción del proyecto
sandbox, `https://itmano-crm-sandbox.vercel.app`, que sale de `main`.

1. Supabase sandbox → Authentication → Hooks → **Send Email Hook** → HTTPS →
   URL `https://itmano-crm-sandbox.vercel.app/api/auth/send-email` → generar
   secreto. No lo actives todavía.
2. Carga el secreto en el proyecto sandbox de Vercel (lo pegas tú) y
   redespliega:
   `vercel env add SEND_EMAIL_HOOK_SECRET production --project itmano-crm-sandbox --scope james-dylans-projects --sensitive`
3. En sandbox el guard simula todo correo a destinatarios fuera de
   `EMAIL_TEST_ALLOWLIST`: añade ahí tu correo (o usa `@resend.dev`), o el
   Magic Link no llega aunque el hook responda 200.
4. Activa el hook y pide un Magic Link en el login del sandbox. Debe llegar, y
   `/admin/operacion` debe mostrarlo en "Magic Links" y en "Correos hoy" de la
   cuenta ITMANO.

### Cambiar producción de SMTP a hook

En una hora tranquila, con el SMTP configurado intacto para volver:

1. Genera el secreto del hook en Supabase producción (sin activarlo), cárgalo
   con el mismo comando apuntando a `--project itmano-crm` y redespliega. El
   orden importa: con el hook activo y la app sin secreto, nadie entra.
2. Activa el hook y pide un Magic Link. Si llega, listo.
3. **Volver a SMTP:** desactiva el hook en Authentication → Hooks. Supabase usa
   de nuevo el SMTP configurado al instante; no hay que tocar código.

Si el hook falla, el login muestra "problema temporal del correo" (5xx) y el
latido `webhook:auth-email` queda en rojo en el panel.

### Anotar cuotas

En `/admin/operacion`, anota la cuota diaria y mensual de cada cuenta de
Resend. Sin cuota anotada la guardia no limita, y el panel lo muestra como
desconocido.

## Decisión pendiente D8 — dirección de respuesta

Hoy secuencias y one-off no fijan `replyTo`: la respuesta va a la dirección de
envío (`<slug>@mail.itmano.com` o `agente@dominio-del-equipo`). Grupales y
open houses fijan `replyTo` al correo personal del agente: esas respuestas
nunca pasan por Resend.

- **Dominio compartido** (`mail.itmano.com`): MX a Resend Inbound sin
  conflicto. Es lo que conviene hacer ya.
- **Dominio propio de un equipo** (Growth/Partner y A&J): apuntar el MX del
  dominio a Resend rompería el buzón real del equipo. Opciones: (a) un
  subdominio de respuestas (`reply.dominio.com`) con `replyTo` hacia él y
  reenvío al agente, (b) dejar que respondan al buzón del agente y no medir
  esas respuestas, (c) `replyTo` al dominio compartido de ITMANO.
  Recomendación: (a), dentro de las instrucciones de DNS de la fase 8C.

## Criterio de terminado

- Un Magic Link pedido en sandbox aparece en el panel y suma a la cuota.
- Forzando la cuota restante a 10, un grupal de 50 se reparte o se rechaza con
  un mensaje claro, sin enviar a medias.
- Los cuatro crons corren desde Vercel y tienen latido.

## Riesgos

- Con el hook, si la app falla, el login falla. Mitigación: alerta de la fase 2
  sobre errores 5xx de la ruta y procedimiento de vuelta a SMTP documentado.
