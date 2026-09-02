import type { PublicEdition, PublicTenant } from '../shared'

// NewsArticle de la edición. Es lo que convierte la firma de un texto en una
// señal que un buscador puede leer: sin esto, "Maria Gonzalez" bajo el titular
// es decoración.
//
// `mainEntityOfPage` lleva la URL CANÓNICA, no la de news.itmano.com. Si el
// canonical y el JSON-LD discrepan, la señal se anula sola.
//
// Sin `jobTitle`: `author_title` sale de `agents.specialty`, que es un código
// de segmento de audiencia (hispanic | military | first_buyer | brazilian),
// no un cargo — hoy siempre es null. La firma pública es sólo el nombre.

export function EditionJsonLd({
  edition, tenant, canonicalUrl,
}: {
  edition: PublicEdition
  tenant: PublicTenant
  canonicalUrl: string
}) {
  const autor = edition.author_name?.trim()
  const data = {
    '@context': 'https://schema.org',
    '@type':    'NewsArticle',
    headline:   edition.title,
    ...(edition.dek ? { description: edition.dek } : {}),
    image:      [edition.cover_image_url],
    ...(edition.published_at ? { datePublished: edition.published_at } : {}),
    inLanguage: edition.language,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    // Firma de persona cuando la hay; de la agencia cuando la edición la firma
    // el tenant (author_name igual al nombre del tenant) o no hay firma.
    author: autor && autor !== tenant.name
      ? { '@type': 'Person', name: autor }
      : { '@type': 'Organization', name: tenant.name },
    publisher: {
      '@type': 'Organization',
      name:    tenant.name,
      ...(tenant.logo_url ? { logo: { '@type': 'ImageObject', url: tenant.logo_url } } : {}),
    },
  }

  return (
    <script
      type="application/ld+json"
      // reason: JSON-LD se inyecta como texto por definición; el contenido es
      // un objeto que construimos aquí, no entrada del visitante.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
