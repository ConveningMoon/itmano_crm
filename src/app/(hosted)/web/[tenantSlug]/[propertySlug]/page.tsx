import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { getPublicTenant, getPublishedProperty, getPublishedPropertyPaths } from '../shared'
import { PublicPropertyView } from './public-property-view'
import { getPublicOpenHouseForProperty } from '@/lib/data/open-houses'
import { alMenosUnParametro, hostedTag } from '@/lib/hosted-cache'

// instant = false a propósito: la página espera sus params fuera de un
// <Suspense> para poder responder 404 de verdad. Los slugs que lista
// generateStaticParams salen prerenderizados igual; uno nuevo se renderiza en
// su primera visita y queda cacheado desde ahí, como el ISR al que sustituye.
export const instant = false

// Detalle público de una propiedad publicada — properties.itmano.com/<t>/<slug>.

// Cacheada — mismo razonamiento que el catálogo: sin cookies ni searchParams,
// y las actions de propiedades y open houses la invalidan al guardar.
//
// El open house entra en la misma entrada a propósito: su lectura compara con
// la hora actual, y eso sólo puede pasar dentro de `use cache` (fuera rompería
// el prerender). Uno que termina deja de mostrarse, como mucho, al vencer los
// 5 minutos del perfil.
async function loadProperty(tenantSlug: string, propertySlug: string) {
  'use cache'
  cacheLife('hosted')
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return null
  // Etiqueta del tenant, no de la propiedad: así una propiedad despublicada o
  // con el slug cambiado también deja de servirse en su URL vieja.
  cacheTag(hostedTag.web(tenant.id))
  const property = await getPublishedProperty(tenant.id, propertySlug)
  if (!property) return null
  const openHouse = await getPublicOpenHouseForProperty(property.id, tenant.id)
  return { tenant, property, openHouse }
}

// Solo las publicadas — una propiedad despublicada no debe prerenderizarse.
export async function generateStaticParams() {
  return alMenosUnParametro(await getPublishedPropertyPaths(), ['tenantSlug', 'propertySlug'])
}

type Params = Promise<{ tenantSlug: string; propertySlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, propertySlug } = await params
  const data = await loadProperty(tenantSlug, propertySlug)
  if (!data) return { title: 'Propiedad no disponible' }
  const { tenant, property } = data
  return {
    title: `${property.name ?? property.address} — ${tenant.name}`,
    description: (property.description_es ?? property.description_en ?? '').slice(0, 160) || undefined,
  }
}

export default async function PublicPropertyDetailPage({ params }: { params: Params }) {
  const { tenantSlug, propertySlug } = await params
  const data = await loadProperty(tenantSlug, propertySlug)
  if (!data) notFound()

  return <PublicPropertyView tenant={data.tenant} property={data.property} openHouse={data.openHouse} />
}
