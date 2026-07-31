import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicTenant, getPublishedProperties, getPublicTenantSlugs } from './shared'
import { PublicCatalog } from './public-catalog'

// Catálogo público de propiedades del tenant — properties.itmano.com/<slug>.
// Solo filas published_to_web con las columnas públicas.

// ISR: la página no lee cookies ni searchParams, así que se cachea y se sirve
// desde el edge en vez de renderizarse por visita. Es el escaparate del cliente
// —la superficie donde la velocidad se ve— y la que más tráfico anónimo recibe.
//
// La ventana de 5 minutos es el techo, no el mecanismo real de frescura: las
// server actions de propiedades llaman a revalidatePath('/web/<slug>') al
// publicar, editar o despublicar, así que un cambio del cliente se ve de
// inmediato. El revalidate solo cubre lo que cambie fuera de la app.
export const revalidate = 300

// Obligatorio para que la ruta entre al manifiesto de prerender: sin esto,
// `revalidate` no tiene efecto sobre un segmento dinámico. Un tenant nuevo que no
// estuviera en el build se sirve bajo demanda (dynamicParams por defecto) y se
// cachea desde su primera visita.
export async function generateStaticParams() {
  return (await getPublicTenantSlugs()).map(tenantSlug => ({ tenantSlug }))
}

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
