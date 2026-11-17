import { describe, it, expect } from 'vitest'
import { securityHeaders, HOSTED_HOST_PATTERN } from '@/lib/routing/security-headers'

// El CRM no se puede incrustar en otro sitio; las páginas alojadas sí (el
// código "Embebible en tu web" es un iframe hacia sus subdominios).

const hosted = new RegExp(`^${HOSTED_HOST_PATTERN}$`)

describe('securityHeaders', () => {
  it('excluye del bloqueo de framing sólo los subdominios alojados', () => {
    for (const h of ['lm.itmano.com', 'events.itmano.com', 'forms.itmano.com', 'properties.itmano.com', 'news.itmano.com']) {
      expect(hosted.test(h)).toBe(true)
    }
    for (const h of ['app.itmano.com', 'itmano.com', 'www.itmano.com', 'propertiesx.example.com']) {
      expect(hosted.test(h)).toBe(false)
    }
  })

  it('el CRM sólo admite iframes del mismo origen', () => {
    const frame = securityHeaders().find(r => r.missing)!
    expect(frame.headers).toContainEqual({ key: 'X-Frame-Options', value: 'SAMEORIGIN' })
    expect(frame.headers).toContainEqual({ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" })
  })

  it('nosniff y referrer-policy aplican a todo', () => {
    const base = securityHeaders().find(r => !r.missing)!
    expect(base.source).toBe('/:path*')
    expect(base.headers.map(h => h.key)).toEqual(['X-Content-Type-Options', 'Referrer-Policy'])
  })
})
