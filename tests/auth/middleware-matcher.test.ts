import { describe, it, expect } from 'vitest'

// MUST mirror the literal in src/proxy.ts `config.matcher` (Next 16 renamed
// middleware → proxy). Next requires that matcher to be a static literal, so we
// can't import it here without pulling in next/server — this copy is the contract,
// asserted below. If you change the proxy matcher, change this string too (and the
// cases will tell you if a public route accidentally became protected).
const MATCHER = '/((?!api|_next/static|_next/image|favicon.ico|login|auth|unsubscribe|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'

const matcherRe = new RegExp(`^${MATCHER}$`)
const isProtected = (path: string) => matcherRe.test(path)

describe('middleware matcher — public/system routes are NOT protected', () => {
  const publicPaths = [
    '/login',
    '/auth/callback',
    '/unsubscribe',
    '/api/intake/chn_abc123/submit',
    '/api/intake/chn_abc123/view',
    '/api/contact/chn_abc123/submit',
    '/api/webhooks/resend',
    '/api/webhooks/webflow/chn_abc123',
    '/api/cron/score-decay',
    '/api/cron/sequence-orchestrator',
    '/api/notifications/dispatch',
    '/api/test/resend-send',
    '/api/health',
    '/api/leads/lead-1/force-next-send', // self-guarded; must not get a redirect
    '/_next/static/chunk.js',
    '/favicon.ico',
    '/logo.png',
  ]

  for (const p of publicPaths) {
    it(`does not protect ${p}`, () => {
      expect(isProtected(p)).toBe(false)
    })
  }
})

describe('middleware matcher — dashboard pages ARE protected', () => {
  const protectedPaths = [
    '/',
    '/dashboard',
    '/leads',
    '/leads/new',
    '/leads/lead-1',
    '/sources',
    '/sources/some-slug',
    '/emails',
    '/emails/new',
    '/analytics',
    '/analytics/emails',
    '/activity',
    '/settings',
    '/admin',
    '/notifications',
  ]

  for (const p of protectedPaths) {
    it(`protects ${p}`, () => {
      expect(isProtected(p)).toBe(true)
    })
  }
})
