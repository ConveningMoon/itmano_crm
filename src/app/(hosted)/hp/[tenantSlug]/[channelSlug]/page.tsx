import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHostedPage } from './load'
import { HostedPageView } from './hosted-page-view'

// Página alojada de un canal de adquisición (lead magnet / evento / contacto).
// Pública — llega por lm|events|forms.itmano.com/<tenant>/<canal> (rewrite del
// proxy) o directamente por /hp/... . La config vive en
// acquisition_channels.hosted_page (constructor en /sources/<canal>). El diseño
// (tema claro editorial + motion) vive en HostedPageView.

// ISR: es donde aterriza el tráfico de anuncios, así que se sirve del cache en
// vez de renderizarse por visita. Antes no se podía: el borrador viajaba en
// `?draft=1` y leer searchParams la forzaba a dinámica. Ahora la vista previa
// tiene su propia ruta (/hp/vista-previa/...).
//
// generateStaticParams es obligatorio — sin él la directiva `revalidate` se
// ignora en un segmento dinámico. La ventana de 5 minutos es solo el techo: al
// guardar en el constructor se llama a revalidatePath de esta ruta.
export const revalidate = 300

export async function generateStaticParams() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('acquisition_channels')
    .select('slug, tenants!inner(slug)')
    .in('channel_type', ['lead_magnet', 'event', 'contact_form'])
    .eq('active', true)
    .is('archived_at', null)
  if (error || !data) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[])
    .map(r => ({
      tenantSlug:  r.tenants?.slug as string | undefined,
      channelSlug: r.slug as string | undefined,
    }))
    .filter((p): p is { tenantSlug: string; channelSlug: string } => !!p.tenantSlug && !!p.channelSlug)
}

type Params = Promise<{ tenantSlug: string; channelSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, channelSlug } = await params
  const page = await loadHostedPage(tenantSlug, channelSlug)
  if (!page) return { title: 'Página no disponible' }
  return {
    title: `${page.config.headline} — ${page.tenant.name}`,
    description: page.config.subheadline || undefined,
  }
}

export default async function HostedChannelPage({ params }: { params: Params }) {
  const { tenantSlug, channelSlug } = await params
  const page = await loadHostedPage(tenantSlug, channelSlug)
  if (!page) notFound()

  const { tenant, channel, config } = page
  return (
    <HostedPageView
      tenant={tenant}
      channel={{ id: channel.id, public_id: channel.public_id, channel_type: channel.channel_type, name: channel.name, slug: channel.slug }}
      config={config}

    />
  )
}
