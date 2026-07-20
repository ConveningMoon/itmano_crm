import 'server-only'
import { Resend } from 'resend'

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
const clients = new Map<'aj' | 'itmano', Resend>()

export function resolveResendAccount(account: string | null | undefined): 'aj' | 'itmano' {
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
  clients.set(acc, client)
  return client
}
