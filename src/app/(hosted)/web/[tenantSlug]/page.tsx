import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cacheLife } from 'next/cache'
import { getPublicTenant, getPublishedProperties, getPublicTenantSlugs } from './shared'
import { PublicCatalog } from './public-catalog'
import { alMenosUnParametro } from '@/lib/hosted-cache'

// instant = false a propósito: la página espera sus params fuera de un
// <Suspense> para poder responder 404 de verdad. Los slugs que lista
// generateStaticParams salen prerenderizados igual; uno nuevo se renderiza en
// su primera visita y queda cacheado desde ahí, como el ISR al que sustituye.
export const instant = false

// Catálogo público de propiedades del tenant — properties.itmano.com/<slug>.
// Solo filas published_to_web con las columnas públicas.

// Cacheada: la página no lee cookies ni searchParams, así que se prerenderiza y
// se sirve desde el edge en vez de renderizarse por visita. Es el escaparate
// del cliente —la superficie donde la velocidad se ve— y la que más tráfico
// anónimo recibe.
//
// La ventana de 5 minutos (perfil `hosted`) es el techo, no el mecanismo real
// de frescura: las server actions de propiedades invalidan esta página al
// publicar, editar o despublicar, así que un cambio del cliente se ve de
// inmediato. El plazo solo cubre lo que cambie fuera de la app.
async function loadCatalog(tenantSlug: string) {
  'use cache'
  cacheLife('hosted')
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return null
  const properties = await getPublishedProperties(tenant.id)
  return { tenant, properties }
}

// Los tenants conocidos se prerenderizan en el build; uno nuevo se sirve bajo
// demanda y se cachea desde su primera visita.
export async function generateStaticParams() {
  const slugs = (await getPublicTenantSlugs()).map(tenantSlug => ({ tenantSlug }))
  return alMenosUnParametro(slugs, ['tenantSlug'])
}

type Params = Promise<{ tenantSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug } = await params
  const catalog = await loadCatalog(tenantSlug)
  if (!catalog) return { title: 'Página no disponible' }
  return {
    title: `Propiedades — ${catalog.tenant.name}`,
    description: `Propiedades disponibles de ${catalog.tenant.name}.`,
  }
}

export default async function PublicPropertiesPage({ params }: { params: Params }) {
  const { tenantSlug } = await params
  const catalog = await loadCatalog(tenantSlug)
  if (!catalog) notFound()

  return <PublicCatalog tenant={catalog.tenant} properties={catalog.properties} />
}
