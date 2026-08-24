import 'server-only'
import { revalidatePath } from 'next/cache'
import type { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

type AdminClient = ReturnType<typeof createAdminClient>

const TENANT_SLUG_COLUMNS  = columns('tenants', ['slug'])
const CHANNEL_SLUG_COLUMNS = columns('acquisition_channels', ['id', 'slug'])

/** Una edición, con lo mínimo para reconstruir su URL pública. */
export interface RevalidatableEdition {
  slug:       string
  channel_id: string
}

/**
 * Invalida el caché de las páginas públicas de newsletters de un tenant.
 *
 * Existe para los dos caminos que cambian ediciones SIN pasar por las server
 * actions del CRM: el cron de ciclo de vida (degradación) y
 * `restoreAfterReactivation` (webhook de Paddle). Sin esto, la degradación y la
 * restauración no se ven hasta que expira la ventana de ISR (`revalidate = 300`
 * en las tres rutas): el archivo de un tenant caído se sigue sirviendo, y el
 * de uno que acaba de volver a pagar sigue apareciendo vacío.
 *
 * Best-effort: nunca lanza. Ninguno de los dos llamadores puede fallar por no
 * haber podido purgar un caché — el dato ya está bien escrito en la base.
 */
export async function revalidateNewsletterPaths(
  db: AdminClient,
  tenantId: string,
  editions: RevalidatableEdition[],
): Promise<void> {
  try {
    const { data: tenantRow } = await db
      .from('tenants').select(TENANT_SLUG_COLUMNS).eq('id', tenantId).maybeSingle()
    const tenantSlug = (tenantRow as { slug: string } | null)?.slug
    if (!tenantSlug) return

    // La portada lista series y ediciones recientes: cambia siempre que cambie
    // cualquier edición del tenant.
    revalidatePath(`/nl/${tenantSlug}`)
    if (editions.length === 0) return

    const channelIds = [...new Set(editions.map(e => e.channel_id))]
    const { data: channelRows } = await db
      .from('acquisition_channels')
      .select(CHANNEL_SLUG_COLUMNS)
      .eq('tenant_id', tenantId)
      .in('id', channelIds)

    const slugByChannel = new Map<string, string>(
      // reason: el cliente de Supabase no está tipado en este repo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((channelRows ?? []) as any[]).map(c => [c.id as string, c.slug as string]),
    )

    const done = new Set<string>()
    for (const edition of editions) {
      const seriesSlug = slugByChannel.get(edition.channel_id)
      if (!seriesSlug) continue
      const seriesPath = `/nl/${tenantSlug}/${seriesSlug}`
      if (!done.has(seriesPath)) {
        done.add(seriesPath)
        revalidatePath(seriesPath)
      }
      revalidatePath(`${seriesPath}/${edition.slug}`)
    }
  } catch (err) {
    console.error(JSON.stringify({
      service: 'newsletters-revalidate', tenant_id: tenantId,
      error: 'revalidate_failed',
      detail: err instanceof Error ? err.message : String(err),
    }))
  }
}
