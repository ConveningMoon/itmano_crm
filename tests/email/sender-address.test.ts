import { describe, it, expect } from 'vitest'
import { agentLocalPart, normalizeLocalPart, ownSendingDomain } from '@/lib/email/sender-address'
import { matchInboundTenant } from '@/lib/email/inbound-tenant'
import { senderFromForAgent, type SenderIdentity } from '@/lib/services/sender-identity'

// Cada correo sale a nombre del agente que lo firma, con su dirección sobre el
// dominio verificado del equipo; en el dominio compartido de ITMANO no cambia.

const aj:     SenderIdentity = { account: 'aj',     from: 'Adriana <adriana@mail.ajrealestateva.com>' }
const shared: SenderIdentity = { account: 'itmano', from: 'Equipo Test <test@mail.itmano.com>' }

describe('senderFromForAgent', () => {
  it('usa el nombre del agente y la parte local de su email sobre el dominio del equipo', () => {
    expect(senderFromForAgent(aj, { name: 'Melany Rojas', email: 'mela@ajrealestateva.com' }))
      .toBe('"Melany Rojas" <mela@mail.ajrealestateva.com>')
  })

  it('normaliza la parte local: sin +etiqueta, acentos ni caracteres raros', () => {
    expect(senderFromForAgent(aj, { name: 'José', email: 'José.Pérez+crm@gmail.com' }))
      .toBe('"José" <jose.perez@mail.ajrealestateva.com>')
  })

  it('sin email usa el primer nombre', () => {
    expect(senderFromForAgent(aj, { name: 'Luis Pérez', email: null })).toBe('"Luis Pérez" <luis@mail.ajrealestateva.com>')
  })

  it('sin datos del agente conserva la dirección y el nombre del equipo', () => {
    expect(senderFromForAgent(aj, { name: '', email: '' })).toBe('"Adriana" <adriana@mail.ajrealestateva.com>')
    expect(senderFromForAgent(aj, null)).toBe(aj.from)
  })

  it('limpia el nombre para que no rompa la cabecera', () => {
    expect(senderFromForAgent(aj, { name: 'Luis "<x>"\r\n', email: 'luis@x.com' })).toBe('"Luis x" <luis@mail.ajrealestateva.com>')
  })

  it('en el dominio compartido de ITMANO no cambia nada', () => {
    expect(senderFromForAgent(shared, { name: 'Melany', email: 'mela@x.com' })).toBe(shared.from)
  })
})

describe('parte local', () => {
  it('rechaza lo que queda vacío', () => {
    expect(normalizeLocalPart('+++')).toBeNull()
    expect(agentLocalPart({ name: null, email: null })).toBeNull()
  })
})

describe('ownSendingDomain', () => {
  it('ITMANO: sólo el sending_domain verificado', () => {
    const t = { resend_account: 'itmano', email_from_address: null, sending_domain: 'mail.cliente.com', domain_status: 'verified' }
    expect(ownSendingDomain(t)).toBe('mail.cliente.com')
    expect(ownSendingDomain({ ...t, domain_status: 'pending' })).toBeNull()
  })

  it('A&J: el dominio de su dirección actual', () => {
    expect(ownSendingDomain({ resend_account: 'aj', email_from_address: aj.from, sending_domain: null, domain_status: 'not_configured' }))
      .toBe('mail.ajrealestateva.com')
  })
})

describe('matchInboundTenant', () => {
  const tenants = [
    { id: 'aj',   slug: 'aj-real-estate', email_from_address: 'Adriana <adriana@mail.ajrealestateva.com>', sending_domain: null },
    { id: 'test', slug: 'test',           email_from_address: null, sending_domain: null },
    { id: 'cli',  slug: 'cliente',        email_from_address: 'Ana <ana@mail.cliente.com>', sending_domain: 'mail.cliente.com' },
  ]

  it('coincidencia exacta', () => {
    expect(matchInboundTenant(['Adriana <adriana@mail.ajrealestateva.com>'], tenants)).toBe('aj')
  })

  it('respuesta a la dirección de un agente: se resuelve por dominio', () => {
    expect(matchInboundTenant(['mela@mail.ajrealestateva.com'], tenants)).toBe('aj')
    expect(matchInboundTenant(['Pedro <PEDRO@mail.cliente.com>'], tenants)).toBe('cli')
  })

  it('dominio compartido: por slug', () => {
    expect(matchInboundTenant(['test@mail.itmano.com'], tenants)).toBe('test')
    expect(matchInboundTenant(['otro@mail.itmano.com'], tenants)).toBeNull()
  })

  it('dominio desconocido o ambiguo: null', () => {
    expect(matchInboundTenant(['x@otro.com'], tenants)).toBeNull()
    const dup = [...tenants, { id: 'dup', slug: 'dup', email_from_address: 'x <x@mail.cliente.com>', sending_domain: null }]
    expect(matchInboundTenant(['pedro@mail.cliente.com'], dup)).toBeNull()
  })
})
