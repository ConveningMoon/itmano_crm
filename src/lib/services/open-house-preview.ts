import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { columns } from '@/lib/supabase/columns'
import { buildOpenHouseMergeVars } from '@/lib/open-houses/format'
import { appBaseUrl, openHouseIcsUrl, openHouseRsvpUrl, propertyPublicUrl } from '@/lib/open-houses/urls'

// Variables de muestra para la vista previa de un correo de open house: los
// datos REALES del evento (fecha, dirección, enlaces) con un lead de ejemplo,
// para que el agente vea exactamente cómo se leerá su correo.

/* eslint-disable @typescript-eslint/no-explicit-any */

const OH_COLUMNS   = columns('open_houses', ['id', 'property_id', 'starts_at', 'ends_at', 'timezone', 'public_notes'])
const PROP_COLUMNS = columns('properties', ['name', 'address', 'city', 'state', 'slug', 'published_to_web', 'external_url'])

export async function openHousePreviewVars(
  db: SupabaseClient,
  args: { openHouseId: string; tenantId: string | null; language: string; agentName: string; agentEmail: string },
): Promise<Record<string, string> | null> {
  let q = db.from('open_houses').select(`${OH_COLUMNS}, tenant_id`).eq('id', args.openHouseId)
  if (args.tenantId) q = q.eq('tenant_id', args.tenantId)
  const { data: oh } = await q.maybeSingle()
  if (!oh) return null
  const o = oh as any

  const [{ data: property }, { data: tenant }] = await Promise.all([
    db.from('properties').select(PROP_COLUMNS).eq('id', o.property_id).eq('tenant_id', o.tenant_id).maybeSingle(),
    db.from('tenants').select(columns('tenants', ['slug'])).eq('id', o.tenant_id).maybeSingle(),
  ])
  if (!property) return null
  const p = property as any
  const tenantSlug = ((tenant as any)?.slug as string | null) ?? ''
  const base = appBaseUrl()

  return buildOpenHouseMergeVars({
    customerName:    'María',
    agentName:       args.agentName,
    agentEmail:      args.agentEmail,
    propertyName:    (p.name as string | null) ?? (p.address as string),
    propertyAddress: [p.address, p.city, p.state].filter(Boolean).join(', '),
    startsAt:        o.starts_at,
    endsAt:          o.ends_at,
    timeZone:        o.timezone,
    language:        args.language,
    publicNotes:     o.public_notes ?? null,
    propertyUrl:     propertyPublicUrl(tenantSlug, p),
    rsvpUrl:         openHouseRsvpUrl(base, tenantSlug, 'vista-previa'),
    calendarUrl:     openHouseIcsUrl(base, o.id),
  })
}
