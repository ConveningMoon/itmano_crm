import 'server-only'
import { Resend } from 'resend'
import { emailAllowed, sendGuardFromEnv, simulatedId, type SendGuard } from '@/lib/email/send-guard'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set')
}

// Cuenta legacy (Adriana / A&J). Sigue siendo el cliente por defecto exportado
// para compatibilidad con el código que aún no rutea por tenant.
export const resend = new Resend(process.env.RESEND_API_KEY)

// ── Router de cuentas Resend por tenant (migración 065) ───────────────────────
// tenants.resend_account: 'aj' → cuenta de Adriana (RESEND_API_KEY, legacy);
// 'itmano' → cuenta de ITMANO (RESEND_API_KEY_ITMANO) para Test y futuros. Si la
// clave de ITMANO no está configurada, cae a la legacy para no romper el envío
// (con aviso en logs). El envío de A&J nunca cambia de cuenta.
type ResendAccount = 'aj' | 'itmano'

const clients = new Map<ResendAccount, Resend>()
const inboundClients = new Map<ResendAccount, Resend>()

export function resolveResendAccount(account: string | null | undefined): ResendAccount {
  return account === 'aj' ? 'aj' : 'itmano'
}

/** true si la cuenta de ITMANO tiene su propia clave configurada (no fallback). */
export function itmanoResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY_ITMANO
}

export function resendForAccount(account: string | null | undefined): Resend {
  const acc = resolveResendAccount(account)
  const cached = clients.get(acc)
  if (cached) return cached

  let key = process.env.RESEND_API_KEY! // legacy (aj)
  if (acc === 'itmano') {
    if (process.env.RESEND_API_KEY_ITMANO) {
      key = process.env.RESEND_API_KEY_ITMANO
    } else {
      console.warn(JSON.stringify({ service: 'resend', warning: 'itmano_key_missing_fallback_legacy' }))
    }
  }
  const client = new Resend(key)
  installSendGuard(client, sendGuardFromEnv(process.env))
  clients.set(acc, client)
  return client
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

  const accountSendKey = acc === 'itmano'
    ? (process.env.RESEND_API_KEY_ITMANO ?? process.env.RESEND_API_KEY!)
    : process.env.RESEND_API_KEY!
  const inboundKey = acc === 'itmano'
    ? process.env.RESEND_INBOUND_API_KEY_ITMANO
    : process.env.RESEND_INBOUND_API_KEY

  if (!inboundKey) {
    console.warn(JSON.stringify({
      service: 'resend',
      warning: 'inbound_read_key_missing_fallback_send_key',
      account: acc,
    }))
  }

  const client = new Resend(inboundKey ?? accountSendKey)
  inboundClients.set(acc, client)
  return client
}
