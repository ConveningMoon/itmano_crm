import 'server-only'
import { resolveResendAccount } from '@/lib/resend'
import {
  ITMANO_SHARED_DOMAIN, addressOf, agentLocalPart, cleanDisplayName, displayNameOf, domainOf, formatFrom,
  type SenderAgent,
} from '@/lib/email/sender-address'

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
//
// Sobre esa identidad, cada correo sale a nombre del agente que lo firma
// (senderFromForAgent).

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

export interface SenderIdentityOptions {
  /**
   * false cuando la suscripción está degradada: se fuerza el dominio compartido
   * de ITMANO. NO se toca tenants.email_from_address en la base — el override
   * ocurre aquí, en la resolución. Es deliberado: el webhook inbound de Resend
   * resuelve el tenant comparando el `to` del reply contra ese campo, así que
   * borrarlo dejaría huérfanas las respuestas a conversaciones en vuelo.
   * Default true = comportamiento previo intacto.
   */
  customDomainAllowed?: boolean
}

export function resolveSenderIdentity(
  t: TenantSenderFields,
  opts: SenderIdentityOptions = {},
): SenderIdentity | null {
  const customAllowed = opts.customDomainAllowed ?? true
  const shared = `${t.name} <${t.slug}@${ITMANO_SHARED_DOMAIN}>`

  // Degradado: dominio compartido y cuenta de ITMANO. Forzar la cuenta es
  // necesario — un from de mail.itmano.com no está verificado en la de A&J.
  if (!customAllowed) return { account: 'itmano', from: shared }

  const account = resolveResendAccount(t.resend_account)

  // A&J / legacy: sin cambios.
  if (account === 'aj') {
    return t.email_from_address ? { account, from: t.email_from_address } : null
  }

  // ITMANO: dominio propio verificado, si no el compartido.
  const useCustom = t.domain_status === 'verified' && !!t.email_from_address
  return { account, from: useCustom ? (t.email_from_address as string) : shared }
}

/**
 * true si la identidad sale del dominio COMPARTIDO de ITMANO. Los envíos
 * masivos (open houses) no se permiten desde ahí: un anuncio mal dirigido
 * afectaría la entrega de todos los tenants que lo comparten. Se decide sobre
 * la identidad ya resuelta —no sobre el plan ni sobre domain_status sueltos—
 * para que la regla sea exactamente "el correo saldría de tu dominio".
 */
export function usesSharedDomain(identity: SenderIdentity): boolean {
  return domainOf(identity.from) === ITMANO_SHARED_DOMAIN
}

// ── Remitente por agente ──────────────────────────────────────────────────────
// Un dominio verificado en Resend acepta cualquier dirección de ese dominio, así
// que cada agente firma con la suya sin tocar el DNS: su nombre como nombre
// visible y la parte local de su email sobre el dominio del equipo
// (Melany, mela@ajrealestateva.com → "Melany" <mela@mail.ajrealestateva.com>).
// En el dominio compartido de ITMANO no se hace: ahí la dirección identifica al
// tenant (slug@mail.itmano.com) y el webhook de respuestas depende de ello.

/**
 * El `from` con el que sale un correo firmado por `agent`. Sin agente, o en el
 * dominio compartido, es el de la identidad del tenant tal cual.
 */
export function senderFromForAgent(
  identity: SenderIdentity,
  agent: SenderAgent | null | undefined,
): string {
  if (!agent || usesSharedDomain(identity)) return identity.from
  const domain = domainOf(identity.from)
  if (!domain) return identity.from

  const address = addressOf(identity.from)
  const local = agentLocalPart(agent) ?? address.slice(0, address.lastIndexOf('@'))
  const name = cleanDisplayName(agent.name ?? '') || displayNameOf(identity.from)
  return formatFrom(name, local, domain)
}
