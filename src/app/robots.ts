import type { MetadataRoute } from 'next'

// Indexación: solo la superficie pública de marketing. El CRM (protegido por
// auth igualmente), las APIs y las páginas utilitarias quedan fuera del índice.
export default function robots(): MetadataRoute.Robots {
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
          '/lead-magnets',
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
