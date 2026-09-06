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
//
// Desde la 113 el `author` ya no se adivina. Antes se comparaba `author_name`
// contra `tenant.name` para decidir Person u Organization: una heurística que
// fallaba en cuanto una agencia se llamara igual que su fundadora. Ahora la
// fila lo dice — `author_name` es la persona y `author_org_name` la agencia —
// y cuando firman las dos, `author` las lleva a ambas (schema.org acepta un
// array), que es literalmente lo que la página muestra.

/**
 * Serializa un valor para incrustarlo en un `<script type="application/ld+json">`.
 *
 * NO es un `JSON.stringify` a secas. `edition.title` y `edition.dek` —los
 * campos que van a `headline`/`description`— son texto que la IA redacta a
 * partir de resultados de búsqueda web, o que escribe el propio tenant:
 * ninguno de los dos pasa por el saneamiento de `renderNewsletterHtml` (ese
 * sólo cubre `content`, no el título ni el dek). Son entrada de un actor NO
 * confiable desde la perspectiva del visitante público de esta página, así
 * que un título que contenga literalmente `</script><script>...` cerraría el
 * tag antes de tiempo y el resto se parsearía como HTML/JS de la página —
 * afectando a cualquier visitante, no sólo al tenant que lo escribió.
 *
 * Escapar `<`, `>` y `&` como secuencias `\uXXXX` rompe esa posibilidad sin
 * tocar el valor: un string JSON con esos caracteres escapados así decodifica
 * exactamente igual al original. Si alguien quita este escape y vuelve a un
 * `JSON.stringify` directo, la página pública vuelve a ser un vector de XSS
 * para cualquiera que consiga escribir (o hacer que la IA redacte) un título
 * de edición — `tests/newsletters/edition-jsonld.test.ts` existe para que
 * ese cambio falle en vez de llegar a producción en silencio.
 */
export function jsonLdScriptBody(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export function EditionJsonLd({
  edition, tenant, canonicalUrl,
}: {
  edition: PublicEdition
  tenant: PublicTenant
  canonicalUrl: string
}) {
  const persona = edition.author_name?.trim()
  const agencia = edition.author_org_name?.trim()

  // Se listan en el mismo orden que la firma visible. Sin ninguna de las dos,
  // la edición la atribuye la agencia que la publica: un NewsArticle sin
  // `author` no es válido para un buscador, y el publisher es el hecho que
  // siempre se cumple.
  const autores = [
    ...(persona ? [{ '@type': 'Person', name: persona }] : []),
    ...(agencia ? [{ '@type': 'Organization', name: agencia }] : []),
  ]
  const data = {
    '@context': 'https://schema.org',
    '@type':    'NewsArticle',
    headline:   edition.title,
    ...(edition.dek ? { description: edition.dek } : {}),
    image:      [edition.cover_image_url],
    ...(edition.published_at ? { datePublished: edition.published_at } : {}),
    inLanguage: edition.language,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    author: autores.length === 0
      ? { '@type': 'Organization', name: tenant.name }
      : autores.length === 1 ? autores[0] : autores,
    publisher: {
      '@type': 'Organization',
      name:    tenant.name,
      ...(tenant.logo_url ? { logo: { '@type': 'ImageObject', url: tenant.logo_url } } : {}),
    },
  }

  return (
    <script
      type="application/ld+json"
      // reason: JSON-LD se inyecta como texto por definición, pero `data`
      // incluye título/dek de la edición, que SÍ son entrada no confiable
      // (ver `jsonLdScriptBody`) — por eso pasa por el escape, no por un
      // `JSON.stringify` directo.
      dangerouslySetInnerHTML={{ __html: jsonLdScriptBody(data) }}
    />
  )
}
