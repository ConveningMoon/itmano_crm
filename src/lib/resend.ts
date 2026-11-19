import 'server-only'
import { Resend } from 'resend'
import { emailAllowed, sendGuardFromEnv, simulatedId, type SendGuard } from '@/lib/email/send-guard'
import { installQuotaTracking } from '@/lib/email/quota-tracking'
import { recordQuotaObservation } from '@/lib/email/quota-server'

// ── Router de cuentas Resend por tenant (migración 065) ───────────────────────
// tenants.resend_account: 'aj' → cuenta propia de A&J (RESEND_API_KEY);
// 'itmano' → cuenta de ITMANO (RESEND_API_KEY_ITMANO) para todos los demás.
//
// Cada cuenta usa SOLO su llave. Antes la app no arrancaba sin la llave de A&J y
// ITMANO caía a ella si faltaba la suya; ese respaldo nunca funcionó (un from de
// mail.itmano.com no está verificado en la cuenta de A&J) y hacía depender a
// toda la plataforma de la llave de un cliente. Ahora, si falta la llave de una
// cuenta, sus envíos devuelven un error claro sin llamar a Resend y el resto de
// tenants sigue enviando.
export type ResendAccount = 'aj' | 'itmano'

const ACCOUNT_ENV: Record<ResendAccount, { send: string; inbound: string }> = {
  aj:     { send: 'RESEND_API_KEY',        inbound: 'RESEND_INBOUND_API_KEY' },
  itmano: { send: 'RESEND_API_KEY_ITMANO', inbound: 'RESEND_INBOUND_API_KEY_ITMANO' },
}

// El SDK de Resend lee process.env.RESEND_API_KEY cuando el constructor recibe
// una llave vacía: con eso, un tenant de ITMANO enviaría por la cuenta de A&J.
// Por eso nunca se le pasa `undefined`, sino este marcador, y los envíos de un
// cliente sin llave se cortan antes de salir (missingKeyGuard).
const MISSING_KEY = 'missing-api-key'

const clients = new Map<ResendAccount, Resend>()
const inboundClients = new Map<ResendAccount, Resend>()

export function resolveResendAccount(account: string | null | undefined): ResendAccount {
  return account === 'aj' ? 'aj' : 'itmano'
}

function envValue(name: string): string | null {
  const v = process.env[name]?.trim()
  return v ? v : null
}

/** true si la cuenta tiene su llave de envío configurada. */
export function resendAccountConfigured(account: string | null | undefined): boolean {
  return envValue(ACCOUNT_ENV[resolveResendAccount(account)].send) !== null
}

export function resendForAccount(account: string | null | undefined): Resend {
  const acc = resolveResendAccount(account)
  const cached = clients.get(acc)
  if (cached) return cached

  const key = envValue(ACCOUNT_ENV[acc].send)
  const client = new Resend(key ?? MISSING_KEY)
  if (key) {
    installSendGuard(client, sendGuardFromEnv(process.env))
    // Por fuera del guard: sólo cuenta lo que llegó a Resend (fase 3, cuotas).
    installQuotaTracking(client, acc, recordQuotaObservation)
  } else {
    console.error(JSON.stringify({ service: 'resend', error: 'account_key_missing', account: acc, env: ACCOUNT_ENV[acc].send }))
    missingKeyGuard(client, acc)
  }
  clients.set(acc, client)
  return client
}

// Sin llave, enviar no sale a la red: devuelve el mismo `{ data, error }` que un
// rechazo de Resend, que todos los llamadores ya manejan, con un mensaje que
// dice qué variable falta.
function missingKeyGuard(client: Resend, account: ResendAccount): void {
  const error = {
    name:       'missing_api_key' as const,
    statusCode: 401,
    message:    `Falta ${ACCOUNT_ENV[account].send}: la cuenta de Resend '${account}' no puede enviar.`,
  }
  client.emails.send = (async () => ({ data: null, error, headers: null })) as unknown as typeof client.emails.send
  client.batch.send  = (async () => ({ data: null, error, headers: null })) as unknown as typeof client.batch.send
}

// Fuera de producción, los envíos a destinatarios no permitidos se simulan
// (ver src/lib/email/send-guard.ts). Se instala sobre la instancia —no en cada
// servicio— para que ningún camino de envío nuevo pueda olvidarse del guard.
function installSendGuard(client: Resend, guard: SendGuard): void {
  if (!guard.restricted) return

  const send = client.emails.send.bind(client.emails)
  client.emails.send = (async (payload: Parameters<typeof send>[0], options?: Parameters<typeof send>[1]) => {
    if (emailAllowed(guard, payload)) return send(payload, options)
    console.warn(JSON.stringify({ service: 'resend', warning: 'send_simulated_outside_production' }))
    return { data: { id: simulatedId() }, error: null, headers: null }
  }) as typeof client.emails.send

  const batchSend = client.batch.send.bind(client.batch)
  client.batch.send = (async (payload: Parameters<typeof batchSend>[0], options?: Parameters<typeof batchSend>[1]) => {
    const allowed = payload.map(email => emailAllowed(guard, email))
    if (allowed.every(Boolean)) return batchSend(payload, options)

    // Los permitidos salen de verdad; el resto recibe un id sintético EN SU
    // POSICIÓN, porque el llamador empareja ids y destinatarios por índice.
    const real = payload.filter((_, i) => allowed[i])
    let realIds: { id: string }[] = []
    if (real.length > 0) {
      const res = await batchSend(real, options)
      if (res.error) return res
      realIds = res.data?.data ?? []
    }
    console.warn(JSON.stringify({ service: 'resend', warning: 'batch_simulated_outside_production', simulated: allowed.filter(a => !a).length }))
    let cursor = 0
    const data = allowed.map(ok => (ok ? realIds[cursor++] : undefined) ?? { id: simulatedId() })
    return { data: { data }, error: null, headers: null }
  }) as typeof client.batch.send
}

/**
 * Cliente de solo lectura para recuperar el contenido de mensajes entrantes.
 * Las API keys de Resend pertenecen a una cuenta concreta, por lo que el
 * cliente debe seguir el mismo ruteo por tenant que los envíos.
 */
export function resendInboundForAccount(account: string | null | undefined): Resend {
  const acc = resolveResendAccount(account)
  const cached = inboundClients.get(acc)
  if (cached) return cached

  // Respaldo sólo DENTRO de la misma cuenta: la llave de lectura, si no la de
  // envío de esa cuenta. Nunca la de otra cuenta, que no puede leer estos correos.
  const inboundKey = envValue(ACCOUNT_ENV[acc].inbound)
  const accountSendKey = envValue(ACCOUNT_ENV[acc].send)

  if (!inboundKey) {
    console.warn(JSON.stringify({
      service: 'resend',
      warning: accountSendKey ? 'inbound_read_key_missing_fallback_send_key' : 'inbound_no_key_for_account',
      account: acc,
    }))
  }

  // Sin ninguna llave, la lectura llega a Resend con el marcador y vuelve como
  // error 401, que el webhook ya registra sin romper el procesamiento.
  const client = new Resend(inboundKey ?? accountSendKey ?? MISSING_KEY)
  inboundClients.set(acc, client)
  return client
}
