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
- [ ] **Variables sobrantes en Vercel producción.** Confirmado con `rg`:
      `CONTACT_FORM_FROM` y `SUPPORT_FORM_TO` no las lee nada, y
      `SUPABASE_JWT_SECRET` sólo la usan `tests/rls/setup.ts` y el workflow
      `rls-tests.yml` de GitHub (no la app). Quitarlas de `itmano-crm` es
      irreversible (son *Sensitive*: Vercel no devuelve el valor), así que
      espera la confirmación de Dylan.
- [ ] **Llaves de lectura inbound de Resend** (acción de Dylan). Crear en cada
      cuenta (ITMANO y A&J) una llave de solo lectura y cargarla como
      `RESEND_INBOUND_API_KEY_ITMANO` y `RESEND_INBOUND_API_KEY` en Vercel
      producción. Después, comprobar que una respuesta real de un lead aparece
      en el CRM.
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
- [ ] Variables de Vercel limpias y llaves inbound cargadas (acciones de Dylan).

## Fuera de alcance

Mover a A&J a la cuenta de ITMANO (decisión del 2026-11-18: se queda en la suya).
