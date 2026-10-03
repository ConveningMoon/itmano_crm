import 'server-only'
import { revalidateTag } from 'next/cache'
import { hostedTag } from '@/lib/hosted-cache'

/**
 * Invalida el caché de las páginas públicas de newsletters de un tenant: la
 * portada y todas sus ediciones comparten el tag `hostedTag.nl(tenantId)`.
 *
 * Existe para los dos caminos que cambian ediciones SIN pasar por las server
 * actions del CRM: el cron de ciclo de vida (degradación) y
 * `restoreAfterReactivation` (webhook de Paddle). Sin esto, la degradación y la
 * restauración no se ven hasta que vencen los 5 minutos del perfil `hosted`:
 * el archivo de un tenant caído se sigue sirviendo, y el de uno que acaba de
 * volver a pagar sigue apareciendo vacío.
 *
 * `revalidateTag` con `{ expire: 0 }` y no `updateTag`: éste sólo existe en
 * server actions. `expire: 0` no sirve la copia vieja ni una vez, igual que el
 * revalidatePath al que sustituye.
 *
 * Best-effort: nunca lanza. Ninguno de los dos llamadores puede fallar por no
 * haber podido purgar un caché — el dato ya está bien escrito en la base.
 */
export function revalidateNewsletterPaths(tenantId: string): void {
  try {
    revalidateTag(hostedTag.nl(tenantId), { expire: 0 })
  } catch (err) {
    console.error(JSON.stringify({
      service: 'newsletters-revalidate', tenant_id: tenantId,
      error: 'revalidate_failed',
      detail: err instanceof Error ? err.message : String(err),
    }))
  }
}
