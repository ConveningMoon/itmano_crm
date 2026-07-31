import { notFound } from 'next/navigation'
import { loadHostedPage } from '../../../[tenantSlug]/[channelSlug]/load'
import { HostedPageView } from '../../../[tenantSlug]/[channelSlug]/hosted-page-view'

// Previsualización del constructor de páginas alojadas.
//
// Existe como ruta propia para que la pública pueda cachearse: mientras el
// borrador viajaba en `?draft=1`, leer searchParams obligaba a /hp a renderizarse
// dinámicamente en cada visita — y esas páginas son justo donde aterriza el
// tráfico de anuncios.
//
// Aquí SÍ es dinámica a propósito: el editor guarda y recarga esperando ver su
// último cambio, así que cachearla sería exactamente lo contrario de lo que hace
// falta.
//
// Cuelga de /hp/ para conservar el comportamiento actual: la URL es pública y
// solo la conoce quien edita. Si en algún momento debe exigir sesión, basta
// moverla fuera de /hp/ — el proxy la protege automáticamente.
export const dynamic = 'force-dynamic'

type Params = Promise<{ tenantSlug: string; channelSlug: string }>

export default async function HostedChannelPreviewPage({ params }: { params: Params }) {
  const { tenantSlug, channelSlug } = await params
  const page = await loadHostedPage(tenantSlug, channelSlug, true)
  if (!page) notFound()

  const { tenant, channel, config } = page
  return (
    <HostedPageView
      tenant={tenant}
      channel={{
        id: channel.id, public_id: channel.public_id,
        channel_type: channel.channel_type, name: channel.name, slug: channel.slug,
      }}
      config={config}
    />
  )
}
