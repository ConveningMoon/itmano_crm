import 'server-only'
import { resolveResendAccount } from '@/lib/resend'

// ── Identidad de envío por tenant (migración 065) ─────────────────────────────
// Decide desde qué cuenta de Resend y con qué "from" sale un correo:
//
//   - A&J (resend_account = 'aj', legacy): comportamiento ACTUAL intacto — usa su
//     email_from_address (su dominio ya está verificado en la cuenta de Adriana).
//     No se toca nada de Adriana.
//   - ITMANO (Test y futuros, resend_account = 'itmano'): si su dominio propio
//     está verificado (domain_status = 'verified') envía desde él; si no, desde el
//     dominio compartido de ITMANO ("<slug>@mail.itmano.com"). Esencial nunca tiene
//     dominio propio → siempre el compartido.

const ITMANO_SHARED_DOMAIN = 'mail.itmano.com'

export interface TenantSenderFields {
  name:               string
  slug:               string
  email_from_address: string | null
  resend_account:     string | null
  domain_status:      string | null
}

export interface SenderIdentity {
  account: 'aj' | 'itmano'
  from:    string
}

export function resolveSenderIdentity(t: TenantSenderFields): SenderIdentity | null {
  const account = resolveResendAccount(t.resend_account)

  // A&J / legacy: sin cambios.
  if (account === 'aj') {
    return t.email_from_address ? { account, from: t.email_from_address } : null
  }

  // ITMANO: dominio propio verificado, si no el compartido.
  const useCustom = t.domain_status === 'verified' && !!t.email_from_address
  const from = useCustom
    ? (t.email_from_address as string)
    : `${t.name} <${t.slug}@${ITMANO_SHARED_DOMAIN}>`
  return { account, from }
}
