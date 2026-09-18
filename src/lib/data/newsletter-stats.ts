import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

// Estadísticas de la newsletter del tenant, por edición y en total.
//
// `aggregateStats` es pura a propósito: no toca la base, así que se prueba
// con datos de mentira sin mocks. `getNewsletterStats` sólo lee y delega.
//
// No necesita el id del canal: los suscriptores se resuelven por el TIPO de
// canal (`channel_type = 'newsletter'`, único por tenant desde la 110) con un
// join dentro de la misma consulta. Así la página puede pedir estas
// estadísticas en la misma ola que `ensureNewsletterChannel`, en vez de
// esperar a que ese helper (que además puede escribir) devuelva el id. Si el
// canal no existe todavía, no hay suscriptores: sale en cero, sin caso aparte.

export interface EditionStats {
  views:       number
  subscribers: number
}

export interface NewsletterTotals {
  subscribers: number
  published:   number
  drafts:      number
  views:       number
}

export interface NewsletterStats {
  totals:    NewsletterTotals
  byEdition: Map<string, EditionStats>
}

/**
 * Agrega vistas y suscriptores por edición y en total.
 *
 * Toda edición del tenant aparece en `byEdition`, aunque no tenga ninguna
 * vista ni suscriptor: la lista del CRM pinta una fila por edición, y si el
 * mapa no la trae la celda queda vacía en vez de decir cero.
 *
 * Una vista o un suscriptor con `edition_id` que no está entre las ediciones
 * recibidas no cuenta en ningún lado del mapa, pero un suscriptor con
 * `edition_id: null` sí entra al total del tenant — se suscribió desde la
 * portada, no desde una edición.
 */
export function aggregateStats(
  editions:    { id: string; status: 'draft' | 'published' | 'archived' }[],
  views:       { edition_id: string | null }[],
  subscribers: { edition_id: string | null }[],
): NewsletterStats {
  const byEdition = new Map<string, EditionStats>()
  for (const e of editions) {
    byEdition.set(e.id, { views: 0, subscribers: 0 })
  }

  let totalViews = 0
  for (const v of views) {
    const stats = v.edition_id ? byEdition.get(v.edition_id) : undefined
    if (!stats) continue
    stats.views += 1
    totalViews += 1
  }

  let totalSubscribers = 0
  for (const s of subscribers) {
    totalSubscribers += 1
    if (!s.edition_id) continue
    const stats = byEdition.get(s.edition_id)
    if (!stats) continue
    stats.subscribers += 1
  }

  let published = 0
  let drafts = 0
  for (const e of editions) {
    if (e.status === 'published') published += 1
    else if (e.status === 'draft') drafts += 1
  }

  return {
    totals: { subscribers: totalSubscribers, published, drafts, views: totalViews },
    byEdition,
  }
}

const STATS_EDITION_COLUMNS = columns('newsletter_editions', ['id', 'status'])
const STATS_VIEW_COLUMNS    = columns('channel_page_views', ['edition_id'])
const STATS_LEAD_COLUMNS    = columns('leads', ['metadata'])
const STATS_LEAD_SELECT     = `${STATS_LEAD_COLUMNS}, acquisition_channels!inner(channel_type, archived_at)`

/**
 * Estadísticas en cero. Exportada para que el llamador la use cuando el canal
 * de newsletter todavía no existe (o no se pudo resolver) — el mismo caso que
 * antes resolvía `getNewsletterStats` por dentro.
 */
export const SIN_DATOS: NewsletterStats = {
  totals:    { subscribers: 0, published: 0, drafts: 0, views: 0 },
  byEdition: new Map(),
}

/**
 * Extrae el `edition_id` que capturó a un suscriptor desde
 * `metadata -> 'newsletter_subscriber' ->> 'edition_id'`. La escribe
 * `subscriberMetadata` (src/lib/newsletters/subscriber.ts) cuando el
 * formulario de la edición manda `edition_id` — ver SubscribeForm.
 *
 * Acceso defensivo igual: un suscriptor de la PORTADA nunca trae esta clave
 * (no viene de ninguna edición), y un lead viejo con `metadata` en cualquier
 * otra forma no puede romper la agregación.
 */
function editionIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const suscripcion = (metadata as Record<string, unknown>).newsletter_subscriber
  if (!suscripcion || typeof suscripcion !== 'object') return null
  const editionId = (suscripcion as Record<string, unknown>).edition_id
  return typeof editionId === 'string' ? editionId : null
}

/**
 * Estadísticas de la newsletter del tenant. Este getter sólo lee, nunca crea
 * nada: el canal implícito lo prepara `ensureNewsletterChannel` por su lado.
 */
export async function getNewsletterStats(tenantId: string): Promise<NewsletterStats> {
  const db = createAdminClient()

  const [{ data: editionRows }, { data: viewRows }, { data: leadRows }] = await Promise.all([
    db.from('newsletter_editions').select(STATS_EDITION_COLUMNS).eq('tenant_id', tenantId),
    db.from('channel_page_views').select(STATS_VIEW_COLUMNS).eq('tenant_id', tenantId).not('edition_id', 'is', null),
    db.from('leads').select(STATS_LEAD_SELECT)
      .eq('tenant_id', tenantId)
      .eq('acquisition_channels.channel_type', 'newsletter')
      .is('acquisition_channels.archived_at', null),
  ])

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó las listas contra el esquema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editions = (editionRows ?? []) as any[] as { id: string; status: 'draft' | 'published' | 'archived' }[]
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const views = (viewRows ?? []) as any[] as { edition_id: string | null }[]
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscribers = ((leadRows ?? []) as any[]).map(row => ({
    edition_id: editionIdFromMetadata(row.metadata),
  }))

  return aggregateStats(editions, views, subscribers)
}
