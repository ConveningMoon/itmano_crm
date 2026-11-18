# Fase 1 — Seguridad y limpieza rápida

**Objetivo:** cerrar riesgos baratos antes de construir encima. Una sesión.

Rama: `feat/saas-fase-01-seguridad` (2026-11-18).

## Tareas

- [x] **Tokens de la API de agente en Git.** `docs/agent-api/README.md` tenía
      dos tokens de sandbox en claro. Comprobado en sandbox el 2026-11-18: los
      tres tokens de `tenant-conduit-demo` **vencieron el 2026-11-15** y
      `src/lib/agent-api/auth.ts` rechaza los vencidos, así que no hubo que
      revocar nada. El README usa ahora marcadores, y
      `tests/security/no-committed-tokens.test.ts` (en `test:unit`) falla si
      un archivo versionado contiene un token de agente, una llave de
      Anthropic, Resend o Google, un secreto `whsec_`, un token de bot de
      Telegram o un JWT de Supabase.
      **Pendiente de Dylan:** si CONDUIT sigue en uso, emitir tokens nuevos con
      `npm run agent:token -- --issue …` y entregarlos por un canal privado.
- [x] **Variables sobrantes en Vercel producción.** `CONTACT_FORM_FROM` y
      `SUPPORT_FORM_TO` no las leía nada, y `SUPABASE_JWT_SECRET` sólo la usan
      `tests/rls/setup.ts` y el workflow `rls-tests.yml` de GitHub. Dylan las
      borró del panel el 2026-11-18, y la CLI confirmó que ya no están en
      `itmano-crm`. La CLI de Vercel quedó en la v66.2.0 vía Volta (había una
      v37 de npm que la tapaba en el `PATH`); el uso correcto está en
      `docs/agents/environments.md` → "CLI de Vercel".
- [x] **Llaves de lectura inbound de Resend → movida a la fase 3.** Comprobado
      en producción el 2026-11-18: `lead_email_replies` está vacía y los 2
      eventos `email_replied` son datos sembrados de junio. Las respuestas de los
      leads nunca han entrado, porque falta configurar Resend Inbound (MX del
      dominio de respuesta), no las llaves. Las llaves sólo sirven después de
      eso, así que van juntas en la fase 3.
- [x] **Webflow.** El webhook nativo (`/api/webhooks/webflow/[publicId]`) ya
      admite un secreto por fuente (`acquisition_channels.metadata.webflow_secret`)
      además de la variable global, así que no es un límite para varios
      clientes. En producción ninguna fuente tiene secreto y no existe la
      variable global: la ruta no se usa. Las solicitudes de "Contact Us - Web"
      de A&J (8 en 90 días, la última el 2026-11-18) entran por otra ruta. No
      se cambió código. Si nadie va a usar el webhook nativo, retirarlo es una
      decisión aparte.
- [x] **Comentarios que mentían.** `plans.ts` (la prueba "no hay procesador de
      pagos") y `createTenant` (la prueba "arranca como plan Partner").
- [x] **Arranque sin la llave de A&J.** `src/lib/resend.ts` ya no lanza un error
      si falta `RESEND_API_KEY` ni exporta el cliente de A&J como cliente por
      defecto (nadie lo importaba). Cada cuenta usa sólo su llave, sin
      respaldo cruzado. El respaldo de ITMANO hacia A&J nunca funcionó, porque
      `mail.itmano.com` no está verificado en la cuenta de A&J. Una cuenta sin
      llave devuelve `missing_api_key` en `emails.send` y `batch.send` sin
      salir a la red. Como el SDK de Resend lee `process.env.RESEND_API_KEY`
      cuando recibe una llave vacía, nunca se le pasa `undefined`. La guarda
      de dominios del Centro de control cubre ahora las dos cuentas. Tests en
      `tests/email/resend-accounts.test.ts`.

## Criterio de terminado

- [x] Ningún token de agente en archivos versionados (lo vigila un test).
- [x] Un tenant `itmano` envía sin la variable de A&J (test).
- [x] Lint sin errores, `tsc`, `test:unit` y build en verde.
- [x] Variables de Vercel limpias (2026-11-18).
- [x] Llaves inbound: movidas a la fase 3 con Resend Inbound.

## Fuera de alcance

Mover a A&J a la cuenta de ITMANO (decisión del 2026-11-18: se queda en la suya).
