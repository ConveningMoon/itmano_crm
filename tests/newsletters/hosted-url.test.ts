import { describe, it, expect } from 'vitest'
import { hostedNewsletterUrl } from '@/lib/hosted-page'

describe('hostedNewsletterUrl', () => {
  it('la portada de la newsletter del tenant', () => {
    expect(hostedNewsletterUrl('aj-real-estate'))
      .toBe('https://news.itmano.com/aj-real-estate')
  })

  it('una edición cuelga directamente del tenant, sin serie', () => {
    expect(hostedNewsletterUrl('aj-real-estate', 'mercado-agosto'))
      .toBe('https://news.itmano.com/aj-real-estate/mercado-agosto')
  })
})
