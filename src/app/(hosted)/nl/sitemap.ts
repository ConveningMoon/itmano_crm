import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import { isExternalCanonical } from '@/lib/newsletters/canonical'

// Sitemap de news.itmano.com. Llega aquí por el rewrite del proxy
// (news.itmano.com/sitemap.xml → /nl/sitemap.xml); ver SEO_FILES en proxy.ts.
//
// Antes no existía: las ediciones sólo se podían descubrir siguiendo enlaces
// desde la portada del tenant, en un producto cuyo objetivo declarado es
// posicionarlas.
//
// Las ediciones de un tenant con canonical al dominio del cliente NO entran:
// pedirle a Google que indexe una URL que declara que su original vive en otro
// sitio es contradecirse. En ese caso la entrada del sitemap es del sitio del
// cliente, y el prompt de integración se lo dice.

export const revalidate = 3600

const EDITION_COLUMNS = columns('newsletter_editions', ['slug', 'tenant_id', 'updated_at'])
const TENANT_COLUMNS  = columns('tenants', ['id', 'slug', 'newsletter_canonical_template'])

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createAdminClient()

  const { data: editionRows, error } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
  // Un sitemap vacío es mejor que un build caído: Google lo reintenta.
  if (error || !editionRows) return []

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó las listas contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editions = editionRows as any[]
  const tenantIds = [...new Set(editions.map(e => e.tenant_id as string))]
  if (tenantIds.length === 0) return []

  const { data: tenantRows } = await db
    .from('tenants').select(TENANT_COLUMNS).in('id', tenantIds)
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenants = (tenantRows ?? []) as any[]

  const porId = new Map(tenants.map(t => [
    t.id as string,
    { slug: t.slug as string, externo: isExternalCanonical(t.newsletter_canonical_template as string | null) },
  ]))

  const entradas: MetadataRoute.Sitemap = []

  // Portada de cada tenant que no delega su canonical.
  for (const [, t] of porId) {
    if (!t.externo) entradas.push({ url: hostedNewsletterUrl(t.slug), changeFrequency: 'weekly', priority: 0.7 })
  }

  for (const e of editions) {
    const t = porId.get(e.tenant_id as string)
    if (!t || t.externo) continue
    entradas.push({
      url:              hostedNewsletterUrl(t.slug, e.slug as string),
      lastModified:     new Date(e.updated_at as string),
      changeFrequency:  'monthly',
      priority:         0.8,
    })
  }

  return entradas
}
