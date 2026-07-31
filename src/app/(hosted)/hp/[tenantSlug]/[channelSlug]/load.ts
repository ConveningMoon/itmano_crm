import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseHostedPage } from '@/lib/hosted-page'

// Carga de una página alojada. Vive aparte porque la comparten la ruta pública
// (cacheada) y la de previsualización (dinámica): `allowDraft` es lo único que
// las distingue.

const HOSTED_TYPES = ['lead_magnet', 'event', 'contact_form']

export async function loadHostedPage(tenantSlug: string, channelSlug: string, allowDraft = false) {
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
