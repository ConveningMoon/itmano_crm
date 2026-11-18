# Fase 1 — Seguridad y limpieza rápida

**Objetivo:** cerrar riesgos baratos antes de construir encima. Una sesión.

## Tareas

- [ ] **Tokens de la API de agente en Git.** `docs/agent-api/README.md`
      contiene dos tokens de sandbox en texto plano. Revocarlos con
      `scripts/agent-token.mjs`, emitir nuevos fuera del repo, sustituir en el
      documento por un marcador (`itmano_agent_sbx_<secreto>`) y decirle a
      Dylan dónde entregar los nuevos a CONDUIT. Añadir un test o un patrón de
      `gitleaks`/hook que falle si aparece `itmano_agent_(sbx|prd)_[A-Za-z0-9_-]{20,}`
      en archivos versionados.
- [ ] **Variables sobrantes en Vercel producción:** retirar
      `SUPABASE_JWT_SECRET`, `CONTACT_FORM_FROM` y `SUPPORT_FORM_TO` tras
      confirmar con `rg` que nada las lee. Es un cambio de panel: lo hace
      Dylan o un agente con el MCP de Vercel y su aprobación.
- [ ] **Llaves de lectura inbound de Resend.** Dylan crea en cada cuenta
      (ITMANO y A&J) una llave de solo lectura y la carga como
      `RESEND_INBOUND_API_KEY_ITMANO` y `RESEND_INBOUND_API_KEY`. Verificar
      después que una respuesta real de un lead aparece en el CRM.
- [ ] **Webflow.** Decidir con Dylan si el webhook nativo de Webflow se usa.
      Si no: documentar que A&J entra por intake y marcar la ruta como
      opcional. Si sí: el secreto debe pasar de variable global a dato por
      fuente (columna cifrada o secreto por `publicId`), porque una variable
      global sólo sirve a un cliente.
- [ ] **Comentarios que mienten.** `plans.ts` ("no hay procesador de pagos")
      y `createTenant` ("arranca como plan Partner"). Corregirlos en el
      mismo PR.
- [ ] **Arranque sin la llave de A&J.** `src/lib/resend.ts` lanza un error si
      falta `RESEND_API_KEY` (la cuenta de A&J), y el cliente por defecto
      exportado es el de A&J. Cambiar a: cada cuenta se resuelve sólo cuando
      se usa, el cliente por defecto pasa a ser el de ITMANO, y la falta de
      una llave afecta sólo a los tenants de esa cuenta. Revisar con `rg`
      cada import de `resend` (el cliente legacy) y rutearlo por tenant.
      Test unitario: sin `RESEND_API_KEY`, un tenant `itmano` envía.

## Criterio de terminado

- `rg "itmano_agent_sbx_[A-Za-z0-9]"` sin resultados en archivos versionados.
- La app arranca y envía para tenants `itmano` sin la variable de A&J.
- Lint, `tsc`, `test:unit` y build en verde.

## Fuera de alcance

Mover a A&J a la cuenta de ITMANO (decisión del 2026-11-18: se queda en la suya).
