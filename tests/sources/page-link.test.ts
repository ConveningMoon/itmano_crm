import { describe, it, expect } from 'vitest'
import { resolveChannelPageUrl } from '@/lib/sources/page-link'

const TENANT = { slug: 'aj-real-estate', managedByItmano: false }

function channel(over: Partial<Parameters<typeof resolveChannelPageUrl>[0]> = {}) {
  return {
    channelType: 'lead_magnet',
    slug: 'guia-compradores',
    pageUrl: null,
    hostedPageEnabled: false,
    ...over,
  }
}

describe('resolveChannelPageUrl', () => {
  it('devuelve el link registrado a mano cuando existe', () => {
    expect(resolveChannelPageUrl(channel({ pageUrl: 'https://lm.ajrealestateva.com/guia' }), TENANT))
      .toBe('https://lm.ajrealestateva.com/guia')
  })

  it('el link registrado gana sobre la pagina del constructor', () => {
    const url = resolveChannelPageUrl(
      channel({ pageUrl: 'https://propio.com/guia', hostedPageEnabled: true }),
      TENANT,
    )
    expect(url).toBe('https://propio.com/guia')
  })

  it('cae a la pagina alojada cuando esta publicada', () => {
    expect(resolveChannelPageUrl(channel({ hostedPageEnabled: true }), TENANT))
      .toBe('https://lm.itmano.com/aj-real-estate/guia-compradores')
  })

  it('usa el subdominio del tipo de canal', () => {
    expect(resolveChannelPageUrl(channel({ channelType: 'event', hostedPageEnabled: true }), TENANT))
      .toContain('https://events.itmano.com/')
    expect(resolveChannelPageUrl(channel({ channelType: 'contact_form', hostedPageEnabled: true }), TENANT))
      .toContain('https://forms.itmano.com/')
  })

  // Un borrador no se abre: la URL existiria pero no serviria nada.
  it('no devuelve la pagina alojada mientras sea borrador', () => {
    expect(resolveChannelPageUrl(channel({ hostedPageEnabled: false }), TENANT)).toBeNull()
  })

  it('sin tenant resuelto no inventa una URL alojada', () => {
    expect(resolveChannelPageUrl(channel({ hostedPageEnabled: true }), undefined)).toBeNull()
    expect(resolveChannelPageUrl(channel({ hostedPageEnabled: true }), { slug: '', managedByItmano: true })).toBeNull()
  })

  it('sin link y sin pagina publicada devuelve null', () => {
    expect(resolveChannelPageUrl(channel(), TENANT)).toBeNull()
  })
})
