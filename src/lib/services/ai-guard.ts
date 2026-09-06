// ── Freno de gasto de IA fuera de producción ─────────────────────────────────
// Las llaves de Anthropic y Google AI son REALES en todos los entornos:
// `.env.development.local` sólo redirige Supabase al sandbox, así que cada
// generación disparada desde local se cobra de verdad a la cuenta de ITMANO.
//
// El tope mensual (`ai-limit.ts`) no cubre este hueco por dos motivos, y los
// dos se dieron a la vez el 26 de agosto de 2026, cuando ~20 generaciones de
// newsletter durante la depuración de la feature costaron ~$8 sin que nada
// avisara:
//
//   1. En local `ai_usage_events` se escribe en el SANDBOX, que arranca en
//      cero. El contador nunca se acerca al tope por más que se gaste.
//   2. `assertAiWithinLimit` deja pasar a `super_admin` sin mirar el saldo — y
//      quien prueba en local es precisamente el super_admin.
//
// Por eso este guard va ANTES de todo lo demás y no depende de la base de
// datos: es una decisión sobre el ENTORNO, no sobre el saldo de un tenant.

/** Variable que autoriza el gasto real de IA fuera de producción. */
export const LOCAL_AI_SPEND_ENV = 'ALLOW_LOCAL_AI_SPEND'

export interface AiSpendEnv {
  NODE_ENV?: string
  ALLOW_LOCAL_AI_SPEND?: string
}

/**
 * ¿Hay que frenar el gasto de IA en este entorno?
 *
 * Pura y con el entorno inyectable para poder probarla sin tocar
 * `process.env`. Tres salidas, en este orden:
 *
 * - `production`: nunca frena. Cubre Vercel entero (producción y preview),
 *   donde Next compila con NODE_ENV=production. Frenar ahí apagaría la IA del
 *   producto, que es justo lo que el cliente paga.
 * - `test`: nunca frena. Las suites no llaman al SDK de Anthropic; sólo
 *   ejercitan el gate contra la base. Frenar ahí rompería `test:ai-limits` sin
 *   ahorrar un centavo.
 * - Cualquier otro (`development`, o sin definir): frena salvo autorización
 *   explícita con ALLOW_LOCAL_AI_SPEND=1.
 */
export function isLocalAiSpendBlocked(env: AiSpendEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false
  if (env.NODE_ENV === 'test') return false
  return env.ALLOW_LOCAL_AI_SPEND !== '1'
}

/**
 * Mensaje del bloqueo. Va a la consola del desarrollador, no a un cliente, así
 * que dice exactamente cómo levantarlo — y por qué está puesto. Da las dos
 * sintaxis a propósito: el equipo desarrolla en Windows/PowerShell, donde la
 * forma `VAR=1 comando` de bash no define nada y falla sin explicar por qué.
 */
export const LOCAL_AI_SPEND_MESSAGE =
  'Gasto de IA bloqueado fuera de producción: las llaves son reales y esta ' +
  'generación se cobraría a la cuenta de ITMANO. Para autorizarla en esta ' +
  `sesión, arranca el servidor con ${LOCAL_AI_SPEND_ENV}=1 — PowerShell: ` +
  `$env:${LOCAL_AI_SPEND_ENV}="1"; npm run dev — bash: ` +
  `${LOCAL_AI_SPEND_ENV}=1 npm run dev. Referencia de costo: una edición de ` +
  'newsletter ~$0.46, de los cuales ~$0.39 son la investigación con web_search.'
