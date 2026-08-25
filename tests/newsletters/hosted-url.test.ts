import { describe, it, expect } from 'vitest'
import { hostedNewsletterUrl, HOSTED_SUBDOMAIN_REWRITE } from '@/lib/hosted-page'

describe('hostedNewsletterUrl', () => {
  it('el subdominio news reescribe a /nl', () => {
    expect(HOSTED_SUBDOMAIN_REWRITE.news).toBe('/nl')
  })

  it('arma las tres profundidades', () => {
    expect(hostedNewsletterUrl('aj')).toBe('https://news.itmano.com/aj')
    expect(hostedNewsletterUrl('aj', 'mercado')).toBe('https://news.itmano.com/aj/mercado')
    expect(hostedNewsletterUrl('aj', 'mercado', 'agosto-2026'))
      .toBe('https://news.itmano.com/aj/mercado/agosto-2026')
  })
})
