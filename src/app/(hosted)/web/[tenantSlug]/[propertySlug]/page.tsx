import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicTenant, getPublishedProperty, getPublishedPropertyPaths } from '../shared'
import { PublicPropertyView } from './public-property-view'

// Detalle público de una propiedad publicada — properties.itmano.com/<t>/<slug>.

// ISR — mismo razonamiento que el catálogo: sin cookies ni searchParams, y las
// actions de propiedades revalidan esta ruta al guardar.
export const revalidate = 300

// Igual que el catálogo: sin esto `revalidate` no aplica. Solo las publicadas —
// una propiedad despublicada no debe prerenderizarse.
export async function generateStaticParams() {
  return getPublishedPropertyPaths()
}

type Params = Promise<{ tenantSlug: string; propertySlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, propertySlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  const property = await getPublishedProperty(tenant.id, propertySlug)
  if (!property) return { title: 'Propiedad no disponible' }
  return {
    title: `${property.name ?? property.address} — ${tenant.name}`,
    description: (property.description_es ?? property.description_en ?? '').slice(0, 160) || undefined,
  }
}

export default async function PublicPropertyDetailPage({ params }: { params: Params }) {
  const { tenantSlug, propertySlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()
  const property = await getPublishedProperty(tenant.id, propertySlug)
  if (!property) notFound()

  return <PublicPropertyView tenant={tenant} property={property} />
}
