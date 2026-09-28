import { ITMANO_SHARED_DOMAIN, addressOf, domainOf } from '@/lib/email/sender-address'

// Resuelve qué tenant recibió una respuesta a partir del `to` del inbound. El
// `to` es NUESTRA dirección de envío, así que identifica al tenant:
//
//   1. Coincidencia exacta con tenants.email_from_address.
//   2. Dominio compartido de ITMANO: la parte local es el slug del tenant
//      (slug@mail.itmano.com, ver resolveSenderIdentity).
//   3. Dominio propio: cada agente envía desde su propia dirección sobre el
//      dominio del equipo (senderFromForAgent), así que basta el dominio —el de
//      email_from_address o el sending_domain registrado—.
//
// Cada paso exige un único tenant; si hay ambigüedad o nada coincide devuelve
// null y el webhook cae a la búsqueda global del lead.

export interface InboundTenantRow {
  id:                 string
  slug:               string | null
  email_from_address: string | null
  sending_domain:     string | null
}

function unique(ids: Set<string>): string | null {
  return ids.size === 1 ? [...ids][0] : null
}

export function matchInboundTenant(toRaw: string[], tenants: InboundTenantRow[]): string | null {
  const toAddresses = toRaw.map(addressOf).filter(a => a.includes('@'))
  if (toAddresses.length === 0) return null

  const exact = new Set(
    tenants
      .filter(t => t.email_from_address && toAddresses.includes(addressOf(t.email_from_address)))
      .map(t => t.id),
  )
  if (exact.size > 0) return unique(exact)

  const sharedSlugs = toAddresses
    .filter(a => domainOf(a) === ITMANO_SHARED_DOMAIN)
    .map(a => a.slice(0, a.lastIndexOf('@')))
  if (sharedSlugs.length > 0) {
    const bySlug = new Set(tenants.filter(t => t.slug && sharedSlugs.includes(t.slug.toLowerCase())).map(t => t.id))
    if (bySlug.size > 0) return unique(bySlug)
  }

  const toDomains = new Set(toAddresses.map(domainOf).filter((d): d is string => !!d && d !== ITMANO_SHARED_DOMAIN))
  const byDomain = new Set(
    tenants
      .filter(t => {
        const domains = [t.email_from_address ? domainOf(t.email_from_address) : null, t.sending_domain?.toLowerCase() ?? null]
        return domains.some(d => d && d !== ITMANO_SHARED_DOMAIN && toDomains.has(d))
      })
      .map(t => t.id),
  )
  return unique(byDomain)
}
