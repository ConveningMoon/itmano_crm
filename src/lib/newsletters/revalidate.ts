import 'server-only'
import { revalidatePath } from 'next/cache'
import type { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

type AdminClient = ReturnType<typeof createAdminClient>

const TENANT_SLUG_COLUMNS = columns('tenants', ['slug'])

/** Una edición, con lo mínimo para reconstruir su URL pública. */
export interface RevalidatableEdition {
  slug: string
}

/**
 * Invalida el caché de las páginas públicas de newsletters de un tenant.
 *
 * Existe para los dos caminos que cambian ediciones SIN pasar por las server
 * actions del CRM: el cron de ciclo de vida (degradación) y
 * `restoreAfterReactivation` (webhook de Paddle). Sin esto, la degradación y la
 * restauración no se ven hasta que expira la ventana de ISR (`revalidate = 300`
 * en las dos rutas): el archivo de un tenant caído se sigue sirviendo, y el
 * de uno que acaba de volver a pagar sigue apareciendo vacío.
 *
 * Best-effort: nunca lanza. Ninguno de los dos llamadores puede fallar por no
 * haber podido purgar un caché — el dato ya está bien escrito en la base.
 *
 * Con una sola newsletter por tenant las rutas son `/nl/<tenant>` y
 * `/nl/<tenant>/<edición>` directamente: no hace falta resolver el slug de
 * ningún canal.
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

    // La portada lista las ediciones publicadas: cambia siempre que cambie
    // cualquier edición del tenant.
    revalidatePath(`/nl/${tenantSlug}`)
    for (const edition of editions) {
      revalidatePath(`/nl/${tenantSlug}/${edition.slug}`)
    }
  } catch (err) {
    console.error(JSON.stringify({
      service: 'newsletters-revalidate', tenant_id: tenantId,
      error: 'revalidate_failed',
      detail: err instanceof Error ? err.message : String(err),
    }))
  }
}
