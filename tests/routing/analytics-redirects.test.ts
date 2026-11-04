import { describe, expect, it } from 'vitest'
import { redirects } from '@/lib/routing/redirects'

describe('redirecciones de Analytics', () => {
  it('/analytics redirige a /dashboard?tab=general', () => {
    expect(redirects).toContainEqual({ source: '/analytics', destination: '/dashboard?tab=general', permanent: false })
  })

  it('/analytics/emails redirige a /dashboard?tab=emails', () => {
    expect(redirects).toContainEqual({ source: '/analytics/emails', destination: '/dashboard?tab=emails', permanent: false })
  })

  it('ninguna es permanente: el destino puede cambiar', () => {
    expect(redirects.every(r => r.permanent === false)).toBe(true)
  })
})
