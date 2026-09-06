import { describe, it, expect } from 'vitest'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'

const tenantConDominio = {
  name:               'TECNOCASA El Prat',
  slug:               'tecnocasa',
  email_from_address: 'Hector <hector@mail.tecnocasa.es>',
  resend_account:     'itmano',
  domain_status:      'verified',
}

describe('resolveSenderIdentity con dominio revocado', () => {
  it('usa el dominio propio cuando está permitido', () => {
    const id = resolveSenderIdentity(tenantConDominio, { customDomainAllowed: true })
    expect(id?.from).toBe('Hector <hector@mail.tecnocasa.es>')
  })

  it('cae al dominio compartido de ITMANO cuando está revocado', () => {
    const id = resolveSenderIdentity(tenantConDominio, { customDomainAllowed: false })
    expect(id?.from).toBe('TECNOCASA El Prat <tecnocasa@mail.itmano.com>')
  })

  it('revocar fuerza tambien la cuenta itmano', () => {
    // Un from de mail.itmano.com no está verificado en la cuenta Resend de A&J.
    const aj = { ...tenantConDominio, resend_account: 'aj' }
    const id = resolveSenderIdentity(aj, { customDomainAllowed: false })
    expect(id?.account).toBe('itmano')
    expect(id?.from).toBe('TECNOCASA El Prat <tecnocasa@mail.itmano.com>')
  })

  it('sin opciones se comporta como antes (compatibilidad)', () => {
    const id = resolveSenderIdentity(tenantConDominio)
    expect(id?.from).toBe('Hector <hector@mail.tecnocasa.es>')
  })
})
