import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { buildIcs } from '@/lib/open-houses/format'

// Archivo .ics de un open house: lo enlazan los correos, la ficha pública y la
// web propia del cliente. Sólo de eventos confirmados o cancelados (un
// borrador no existe fuera del CRM). UID estable + SEQUENCE = revisión, así
// que reabrirlo tras un cambio actualiza el evento en el calendario.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const OH_COLUMNS   = columns('open_houses', ['id', 'tenant_id', 'property_id', 'starts_at', 'ends_at', 'public_notes', 'status', 'revision'])
const PROP_COLUMNS = columns('properties', ['name', 'address', 'city', 'state'])
const TENANT_COLUMNS = columns('tenants', ['name'])

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404 })

  const db = createAdminClient()
  const { data: oh } = await db
    .from('open_houses')
    .select(OH_COLUMNS)
    .eq('id', id)
    .in('status', ['scheduled', 'cancelled'])
    .maybeSingle()
  if (!oh) return new Response('Not found', { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = oh as any

  const [{ data: property }, { data: tenant }] = await Promise.all([
    db.from('properties').select(PROP_COLUMNS).eq('id', o.property_id).eq('tenant_id', o.tenant_id).maybeSingle(),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', o.tenant_id).maybeSingle(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (property ?? {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantName = ((tenant as any)?.name as string | undefined) ?? ''
  const location = [p.address, p.city, p.state].filter(Boolean).join(', ')

  const ics = buildIcs({
    id:          o.id,
    revision:    o.revision,
    title:       `Open house — ${p.name ?? p.address ?? tenantName}`,
    location,
    description: [tenantName, o.public_notes].filter(Boolean).join('\n'),
    startsAt:    o.starts_at,
    endsAt:      o.ends_at,
    cancelled:   o.status === 'cancelled',
  })

  return new Response(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="open-house.ics"',
      'Cache-Control':       'public, max-age=300',
    },
  })
}
