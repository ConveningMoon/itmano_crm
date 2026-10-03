import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cacheLife } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHostedPage } from './load'
import { HostedPageView } from './hosted-page-view'
import { alMenosUnParametro } from '@/lib/hosted-cache'

// instant = false a propósito: la página espera sus params fuera de un
// <Suspense> para poder responder 404 de verdad. Los slugs que lista
// generateStaticParams salen prerenderizados igual; uno nuevo se renderiza en
// su primera visita y queda cacheado desde ahí, como el ISR al que sustituye.
export const instant = false

// Página alojada de un canal de adquisición (lead magnet / evento / contacto).
// Pública — llega por lm|events|forms.itmano.com/<tenant>/<canal> (rewrite del
// proxy) o directamente por /hp/... . La config vive en
// acquisition_channels.hosted_page (constructor en /sources/<canal>). El diseño
// (tema claro editorial + motion) vive en HostedPageView.

// Cacheada: es donde aterriza el tráfico de anuncios, así que se sirve del
// cache en vez de renderizarse por visita. Antes no se podía: el borrador
// viajaba en `?draft=1` y leer searchParams la forzaba a dinámica. Ahora la
// vista previa tiene su propia ruta (/hp/vista-previa/...), que llama a
// loadHostedPage sin este envoltorio.
//
// La ventana de 5 minutos (perfil `hosted`) es solo el techo: al guardar en el
// constructor se invalida esta página.
async function loadPublishedPage(tenantSlug: string, channelSlug: string) {
  'use cache'
  cacheLife('hosted')
  return loadHostedPage(tenantSlug, channelSlug)
}

export async function generateStaticParams() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('acquisition_channels')
    .select('slug, tenants!inner(slug)')
    .in('channel_type', ['lead_magnet', 'event', 'contact_form'])
    .eq('active', true)
    .is('archived_at', null)
  if (error || !data) return alMenosUnParametro([], ['tenantSlug', 'channelSlug'])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paths = (data as any[])
    .map(r => ({
      tenantSlug:  r.tenants?.slug as string | undefined,
      channelSlug: r.slug as string | undefined,
    }))
    .filter((p): p is { tenantSlug: string; channelSlug: string } => !!p.tenantSlug && !!p.channelSlug)
  return alMenosUnParametro(paths, ['tenantSlug', 'channelSlug'])
}

type Params = Promise<{ tenantSlug: string; channelSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, channelSlug } = await params
  const page = await loadPublishedPage(tenantSlug, channelSlug)
  if (!page) return { title: 'Página no disponible' }
  return {
    title: `${page.config.headline} — ${page.tenant.name}`,
    description: page.config.subheadline || undefined,
  }
}

export default async function HostedChannelPage({ params }: { params: Params }) {
  const { tenantSlug, channelSlug } = await params
  const page = await loadPublishedPage(tenantSlug, channelSlug)
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
