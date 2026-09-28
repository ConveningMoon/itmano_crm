// Utilidades puras sobre direcciones de remitente. Sin dependencias de servidor
// para que las usen igual los envíos, el webhook, el panel de admin y los tests.

/** Dominio compartido de ITMANO: `<slug>@mail.itmano.com` (ver resolveSenderIdentity). */
export const ITMANO_SHARED_DOMAIN = 'mail.itmano.com'

/** La dirección de un `from` (`"Nombre" <a@b>` o `a@b`), en minúsculas. */
export function addressOf(from: string): string {
  const m = /<([^>]+)>/.exec(from)
  return (m ? m[1] : from).trim().toLowerCase()
}

/** El dominio de un `from` o de una dirección; null si no tiene `@`. */
export function domainOf(from: string): string | null {
  const address = addressOf(from)
  const at = address.lastIndexOf('@')
  return at > 0 && at < address.length - 1 ? address.slice(at + 1) : null
}

/** El nombre visible de un `from`, sin comillas; '' si no tiene. */
export function displayNameOf(from: string): string {
  const i = from.indexOf('<')
  return i > 0 ? cleanDisplayName(from.slice(0, i)) : ''
}

/** Nombre apto para la cabecera: sin comillas, ángulos ni saltos de línea. */
export function cleanDisplayName(name: string): string {
  return name.replace(/["<>\r\n]/g, '').trim()
}

/** Parte local válida para un remitente: [a-z0-9._-], sin `+etiqueta` ni acentos. */
export function normalizeLocalPart(raw: string): string | null {
  const local = raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split('+')[0]
    .replace(/[^a-z0-9._-]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
  return local && local.length <= 64 ? local : null
}

export interface SenderAgent {
  name:  string | null
  email: string | null
  /** agents.sender_local_part: la parte local fijada a mano; manda sobre la derivada. */
  senderLocalPart?: string | null
}

/**
 * Parte local del agente: la fijada en agents.sender_local_part; si no, la de
 * su email o, sin email, su primer nombre.
 */
export function agentLocalPart(agent: SenderAgent): string | null {
  const fixed = agent.senderLocalPart ? normalizeLocalPart(agent.senderLocalPart) : null
  if (fixed) return fixed
  const email = agent.email?.trim() ?? ''
  const at = email.lastIndexOf('@')
  if (at > 0) {
    const fromEmail = normalizeLocalPart(email.slice(0, at))
    if (fromEmail) return fromEmail
  }
  const firstName = agent.name?.trim().split(/\s+/)[0] ?? ''
  return firstName ? normalizeLocalPart(firstName) : null
}

/** `"Nombre" <local@dominio>`, o sólo la dirección si no hay nombre. */
export function formatFrom(name: string, local: string, domain: string): string {
  const clean = cleanDisplayName(name)
  return clean ? `"${clean}" <${local}@${domain}>` : `${local}@${domain}`
}

/**
 * El dominio propio desde el que el tenant puede enviar, o null si no tiene:
 *   - ITMANO: su sending_domain, sólo cuando Resend lo dio por verificado.
 *   - A&J (legacy, resend_account = 'aj'): el dominio de su email_from_address
 *     actual, verificado en la cuenta de Adriana (ahí no se registra
 *     sending_domain).
 * Es el único dominio aceptado al fijar el remitente por defecto del equipo.
 */
export function ownSendingDomain(t: {
  resend_account:     string | null
  email_from_address: string | null
  sending_domain:     string | null
  domain_status:      string | null
}): string | null {
  if (t.resend_account === 'aj') {
    const d = t.email_from_address ? domainOf(t.email_from_address) : null
    return d && d !== ITMANO_SHARED_DOMAIN ? d : null
  }
  return t.domain_status === 'verified' && t.sending_domain ? t.sending_domain.toLowerCase() : null
}
