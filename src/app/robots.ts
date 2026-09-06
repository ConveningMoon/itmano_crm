import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { HOSTED_SUBDOMAIN_REWRITE } from '@/lib/hosted-page'

// robots.ts SOLO existe en la raíz de `app`
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md:
// "in the root of `app` directory") — no se puede anidar uno propio bajo
// `nl/`. Antes eso significaba que news.itmano.com servía este mismo archivo
// sin cambios: el robots del CRM, con su `Sitemap:` apuntando a
// app.itmano.com — el escaparate de newsletters no tenía ninguno propio.
//
// La solución es que este archivo se ramifique por host en vez de vivir en el
// proxy: el propio doc dice que `robots.js` es "a special Route Handler that
// is cached by default unless it uses a Request-time API" — `headers()` es
// justo eso, así que llamarlo aquí basta para que Next lo vuelva dinámico por
// host sin configuración aparte. No pasa por src/proxy.ts: robots.txt está
// fuera del matcher (ver SEO_FILES y el comentario del matcher ahí).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').toLowerCase()
  const subdomain = host.split('.')[0]

  if (HOSTED_SUBDOMAIN_REWRITE[subdomain] === '/nl') {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
      sitemap: 'https://news.itmano.com/sitemap.xml',
    }
  }

  // Indexación por defecto (app.itmano.com y cualquier otro host): solo la
  // superficie pública de marketing. El CRM (protegido por auth igualmente),
  // las APIs y las páginas utilitarias quedan fuera del índice.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/leads',
          '/properties',
          '/emails',
          '/sources',
          '/analytics',
          '/notifications',
          '/activity',
          '/admin',
          '/settings',
          '/login',
          '/api/',
          '/unsubscribe',
          '/auth/',
        ],
      },
    ],
    sitemap: 'https://app.itmano.com/sitemap.xml',
  }
}
