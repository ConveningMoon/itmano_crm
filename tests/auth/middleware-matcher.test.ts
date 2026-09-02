import { describe, it, expect } from 'vitest'

// MUST mirror the literal in src/proxy.ts `config.matcher` (Next 16 renamed
// middleware → proxy). Next requires that matcher to be a static literal, so we
// can't import it here without pulling in next/server — this copy is the contract,
// asserted below. If you change the proxy matcher, change this string too (and the
// cases will tell you if a public route accidentally became protected).
const MATCHER = '/((?!api|_next/static|_next/image|favicon.ico|login|auth|unsubscribe|planes|terminos|privacidad|reembolsos|hp/|web/|nl/|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|txt|mp4|webm)$).+)'

const matcherRe = new RegExp(`^${MATCHER}$`)
const isProtected = (path: string) => matcherRe.test(path)

describe('middleware matcher — public/system routes are NOT protected', () => {
  const publicPaths = [
    '/', // marketing landing
    '/planes',
    '/terminos',
    '/privacidad',
    '/reembolsos',
    '/robots.txt',
    '/login',
    '/auth/callback',
    '/unsubscribe',
    '/hp/aj-real-estate/guia-compradores',   // página alojada de canal (060)
    '/web/aj-real-estate',                   // catálogo público de propiedades
    '/web/aj-real-estate/casa-hampton',      // detalle público de propiedad
    // Escaparate público de newsletters (news.itmano.com → /nl). El rewrite por
    // host va antes del guard, así que el subdominio funcionaba igual; lo que
    // se rompía era el enlace compartido a app.itmano.com/nl/…, que acababa
    // en /login.
    '/nl/aj-real-estate',
    '/nl/aj-real-estate/mercado',
    '/nl/aj-real-estate/mercado/agosto-2026',
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
    // El script de medición que cargan las landings externas. Protegerlo les
    // devolvía el HTML de /login donde esperaban JavaScript.
    '/intake.js',
    // El recorrido del producto que reproduce el hero de la landing.
    '/landing/producto.mp4',
    '/landing/producto.webm',
    '/landing/producto-poster.webp',
    '/favicon.ico',
    '/logo.png',
  ]

  for (const p of publicPaths) {
    it(`does not protect ${p}`, () => {
      expect(isProtected(p)).toBe(false)
    })
  }
})

// sitemap.xml SÍ entra al matcher: es la única forma de que el rewrite por
// host lo mande a /nl en news.itmano.com. Que siga siendo público en
// app.itmano.com pasa a ser responsabilidad del guard, no del matcher — ver
// SEO_FILES en src/proxy.ts. Si alguien lo devuelve a la exclusión del
// matcher, el sitemap de news deja de existir en silencio.
//
// robots.txt NO recibe el mismo tratamiento: ya cae en la exclusión genérica
// de extensión `.txt$` (comparte esa exclusión con los .txt de licencias de
// fuentes en /studio/fonts/, así que no se puede tocar sin dejarlos detrás del
// login). Por eso robots.txt se queda fuera del matcher para siempre, y
// app/robots.ts se ramifica por host en su lugar — ver ese archivo.
describe('middleware matcher — sitemap.xml pasa por el proxy, robots.txt no', () => {
  it('sitemap.xml entra al matcher', () => {
    expect(isProtected('/sitemap.xml')).toBe(true)
  })

  it('robots.txt se queda fuera del matcher (lo excluye el patrón genérico .txt$)', () => {
    expect(isProtected('/robots.txt')).toBe(false)
  })
})

describe('middleware matcher — dashboard pages ARE protected', () => {
  const protectedPaths = [
    '/dashboard',
    '/leads',
    '/leads/new',
    '/leads/lead-1',
    '/properties',
    '/properties/some-uuid',
    '/sources',
    '/sources/some-slug',
    // La sección del CRM. Empieza por "nl" pero NO por "nl/": la barra del
    // literal es lo que impide que excluir el escaparate público desproteja
    // también el editor.
    '/newsletters',
    '/newsletters/some-uuid',
    '/newsletters/nueva',
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
