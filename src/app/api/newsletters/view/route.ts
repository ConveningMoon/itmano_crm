import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { parseViewPayload, parseVisitorId } from './payload'

// Beacon de vistas de una edición de newsletter — mismo patrón que
// intake/[publicId]/view: body text/plain (JSON serializado) para no disparar
// preflight, y 200 siempre porque un beacon no se puede reintentar.
//
// Lo único que llega del cliente es el id de la edición; tenant_id y
// channel_id se resuelven aquí, en el servidor, leyéndolos de la propia
// edición. El insert corre con service_role porque `anon` no puede escribir
// en channel_page_views (policy de la migración 003: is_super_admin() OR
// tenant_id = get_my_tenant_id(), que anon nunca cumple).

const EDITION_COLUMNS = columns('newsletter_editions', ['id', 'tenant_id', 'channel_id', 'status', 'unpublished_by_billing'])

export async function POST(request: Request) {
  const raw = await request.text()
  const editionId = parseViewPayload(raw)

  if (!editionId) {
    console.warn(JSON.stringify({ service: 'newsletter-view', result: 'noop', reason: 'invalid_payload' }))
    return new Response(null, { status: 200 })
  }

  const db = createAdminClient()

  const { data: edition } = await db
    .from('newsletter_editions')
    .select(EDITION_COLUMNS)
    .eq('id', editionId)
    .eq('status', 'published')
    .eq('unpublished_by_billing', false)
    .maybeSingle()

  // No contar vistas de ediciones inexistentes, despublicadas o degradadas
  // por facturación — la página pública tampoco las sirve.
  if (!edition) {
    console.warn(JSON.stringify({ service: 'newsletter-view', edition_id: editionId, result: 'noop', reason: 'edition_not_found_or_unpublished' }))
    return new Response(null, { status: 200 })
  }

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tenant_id: tenantId, channel_id: channelId } = edition as any as { tenant_id: string; channel_id: string }

  const visitorId = parseVisitorId(raw)
  if (!visitorId) {
    console.warn(JSON.stringify({ service: 'newsletter-view', edition_id: editionId, result: 'noop', reason: 'missing_visitor_id' }))
    return new Response(null, { status: 200 })
  }

  // Dedup de vista única: mismo razonamiento que intake/[publicId]/view — si
  // este visitante ya registró una vista de esta edición en las últimas 24h,
  // recargar la página no infla el conteo.
  const dedupSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentView } = await db
    .from('channel_page_views')
    .select('id')
    .eq('edition_id', editionId)
    .eq('visitor_fingerprint', visitorId)
    .gte('created_at', dedupSince)
    .limit(1)
    .maybeSingle()
  if (recentView) {
    console.log(JSON.stringify({ service: 'newsletter-view', edition_id: editionId, result: 'deduped' }))
    return new Response(null, { status: 200 })
  }

  const { error: insertError } = await db.from('channel_page_views').insert({
    channel_id:          channelId,
    tenant_id:           tenantId,
    edition_id:          editionId,
    visitor_fingerprint: visitorId,
  })

  if (insertError) {
    console.error(JSON.stringify({
      service: 'newsletter-view', edition_id: editionId, channel_id: channelId,
      result: 'insert_failed', code: insertError.code, detail: insertError.message,
    }))
  } else {
    console.log(JSON.stringify({ service: 'newsletter-view', edition_id: editionId, channel_id: channelId, result: 'inserted' }))
  }

  return new Response(null, { status: 200 })
}
