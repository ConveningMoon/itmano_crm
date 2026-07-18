import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicTenant, getPublishedProperties } from './shared'
import { PublicCatalog } from './public-catalog'

// Catálogo público de propiedades del tenant — properties.itmano.com/<slug>.
// Solo filas published_to_web con las columnas públicas.

type Params = Promise<{ tenantSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  return {
    title: `Propiedades — ${tenant.name}`,
    description: `Propiedades disponibles de ${tenant.name}.`,
  }
}

export default async function PublicPropertiesPage({ params }: { params: Params }) {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()

  const properties = await getPublishedProperties(tenant.id)

  return <PublicCatalog tenant={tenant} properties={properties} />
}
