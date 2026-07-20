import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseHostedPage } from '@/lib/hosted-page'
import { HostedPageView } from './hosted-page-view'

// Página alojada de un canal de adquisición (lead magnet / evento / contacto).
// Pública — llega por lm|events|forms.itmano.com/<tenant>/<canal> (rewrite del
// proxy) o directamente por /hp/... . La config vive en
// acquisition_channels.hosted_page (constructor en /sources/<canal>). El diseño
// (tema claro editorial + motion) vive en HostedPageView.

type Params = Promise<{ tenantSlug: string; channelSlug: string }>
type SearchParams = Promise<{ draft?: string }>

const HOSTED_TYPES = ['lead_magnet', 'event', 'contact_form']

async function loadPage(tenantSlug: string, channelSlug: string, allowDraft = false) {
  const db = createAdminClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color')
    .eq('slug', tenantSlug)
    .maybeSingle()
  if (!tenant) return null

  const t = tenant as { id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null }

  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, public_id, channel_type, name, slug, active, hosted_page')
    .eq('tenant_id', t.id)
    .eq('slug', channelSlug)
    .eq('active', true)
    .is('archived_at', null)
    .maybeSingle()
  if (!channel) return null

  const c = channel as {
    id: string; public_id: string; channel_type: string; name: string
    slug: string; active: boolean; hosted_page: unknown
  }
  if (!HOSTED_TYPES.includes(c.channel_type)) return null

  const config = parseHostedPage(c.hosted_page)
  // Borrador: el editor guarda enabled=false y previsualiza con ?draft=1 (la
  // URL solo la conoce quien edita — riesgo aceptable para un borrador).
  if (!config || (!config.enabled && !allowDraft)) return null

  return { tenant: t, channel: c, config }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, channelSlug } = await params
  const page = await loadPage(tenantSlug, channelSlug)
  if (!page) return { title: 'Página no disponible' }
  return {
    title: `${page.config.headline} — ${page.tenant.name}`,
    description: page.config.subheadline || undefined,
  }
}

export default async function HostedChannelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { tenantSlug, channelSlug } = await params
  const { draft } = await searchParams
  const page = await loadPage(tenantSlug, channelSlug, draft === '1')
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
