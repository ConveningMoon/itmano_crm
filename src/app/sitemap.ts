import type { MetadataRoute } from 'next'

// Solo las páginas públicas de marketing/legales.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://app.itmano.com'
  return [
    { url: `${base}/`,            changeFrequency: 'weekly',  priority: 1 },
    { url: `${base}/terminos`,    changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/privacidad`,  changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/reembolsos`,  changeFrequency: 'monthly', priority: 0.3 },
  ]
}
