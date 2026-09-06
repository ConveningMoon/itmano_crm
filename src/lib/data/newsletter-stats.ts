import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

// Estadísticas de la newsletter del tenant, por edición y en total.
//
// `aggregateStats` es pura a propósito: no toca la base, así que se prueba
// con datos de mentira sin mocks. `getNewsletterStats` sólo lee y delega.
//
// Recibe `channelId` ya resuelto en vez de resolverlo por dentro: su único
// llamador (newsletters/page.tsx) ya corre `ensureNewsletterChannel` una línea
// antes para preparar la página, y ese helper ESCRIBE (puede crear el canal).
// Un getter que escribe es una sorpresa; repetir la resolución aquí además
// duplicaba la lectura. Devolver `SIN_DATOS` sigue siendo el llamador quien
// decide — ver newsletters/page.tsx.

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
 * Estadísticas de la newsletter del tenant. `channelId` es el canal implícito
 * ya resuelto (`ensureNewsletterChannel`) — este getter sólo lee, nunca crea
 * nada.
 */
export async function getNewsletterStats(tenantId: string, channelId: string): Promise<NewsletterStats> {
  const db = createAdminClient()

  const [{ data: editionRows }, { data: viewRows }, { data: leadRows }] = await Promise.all([
    db.from('newsletter_editions').select(STATS_EDITION_COLUMNS).eq('tenant_id', tenantId),
    db.from('channel_page_views').select(STATS_VIEW_COLUMNS).eq('tenant_id', tenantId).not('edition_id', 'is', null),
    db.from('leads').select(STATS_LEAD_COLUMNS).eq('tenant_id', tenantId).eq('acquisition_channel_id', channelId),
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
