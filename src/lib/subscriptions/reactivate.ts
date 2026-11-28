import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { revalidateNewsletterPaths } from '@/lib/newsletters/revalidate'

const RESTORED_EDITION_COLUMNS = columns('newsletter_editions', ['id'])

export interface ReactivationReport {
  propertiesRepublished:  number
  newslettersRepublished: number
}

/**
 * Restaura lo que la degradación modificó. Propiedades y newsletters siguen el
 * mismo mecanismo (unpublished_by_billing es una MARCA de procedencia, no un
 * estado): al restaurar vuelve SOLO lo que esa marca señala, nunca todo lo que
 * esté en el estado "bajado". Los runs de secuencia nunca cambiaron de estado
 * (Task 12 Step 4), así que se reanudan solos al volver a pasar el gate de
 * suscripción — y la guardia de frescura (isRunStale) impide que un envío
 * vencido hace meses se dispare.
 */
export async function restoreAfterReactivation(
  tenantId: string,
  opts?: { cap: number | null },
): Promise<ReactivationReport> {
  const supabase = createAdminClient()
  const cap = opts?.cap ?? null

  // Republicar SOLO lo que despublicó el sistema (unpublished_by_billing =
  // true). Sin este filtro se republicaría una casa que el cliente quitó a
  // propósito por estar vendida — la diferencia entre restaurar y meter la
  // pata en la web pública del cliente.
  // Con tope (plan actual tras el evento) sólo vuelven las más recientes hasta
  // llenar el cupo libre `cap - ya publicadas`; el resto conserva la marca para
  // que una mejora de plan posterior pueda restaurarlas. Sin tope: todas.
  let restoredCount = 0
  if (cap === null) {
    const { data: restored } = await supabase
      .from('properties')
      .update({ published_to_web: true, unpublished_by_billing: false })
      .eq('tenant_id', tenantId)
      .eq('unpublished_by_billing', true)
      .select('id')
    restoredCount = (restored ?? []).length
  } else if (cap > 0) {
    const { count: publishedNow, error: countError } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('published_to_web', true)
    // Un conteo fallido NO puede tomarse como 0: republicaria por encima del
    // tope. Se lanza; persist.ts lo captura y lo registra.
    if (countError) throw countError
    const room = cap - (publishedNow ?? 0)
    if (room > 0) {
      const { data: candidates, error: candidatesError } = await supabase
        .from('properties')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('unpublished_by_billing', true)
        // Una que el usuario republico a mano durante la degradacion sigue
        // marcada (updateProperty no limpia la marca) y no debe ocupar cupo.
        .eq('published_to_web', false)
        .order('updated_at', { ascending: false })
        // Mismo desempate que el cron: sin él el conjunto restaurado variaría.
        .order('id', { ascending: false })
        .limit(room)
      if (candidatesError) throw candidatesError
      const ids = ((candidates ?? []) as { id: string }[]).map(p => p.id)
      if (ids.length > 0) {
        const { data: restored, error: restoreError } = await supabase
          .from('properties')
          .update({ published_to_web: true, unpublished_by_billing: false })
          .eq('tenant_id', tenantId)
          .in('id', ids)
          .select('id')
        if (restoreError) throw restoreError
        restoredCount = (restored ?? []).length
      }
    }
  }

  // Gracia nueva: un over_cap_since viejo (de antes de la degradacion) haria
  // que el cron despublicara de inmediato al reactivarse.
  await supabase.from('subscriptions').update({ over_cap_since: null }).eq('tenant_id', tenantId)

  // Mismo criterio para newsletters: solo `unpublished_by_billing = true`
  // vuelve a `published`. Una edición que el tenant dejó en `draft` a
  // propósito (nunca llegó a publicarla) NO lleva esa marca, así que este
  // UPDATE no la toca — publicar un borrador que el tenant nunca quiso
  // publicar es exactamente el fallo que la marca existe para evitar. Una
  // edición `archived` tampoco la lleva nunca (el paso de degradación solo
  // marca `status = 'published'`), así que queda fuera por el mismo filtro.
  const { data: restoredNewsletters } = await supabase
    .from('newsletter_editions')
    .update({ status: 'published', unpublished_by_billing: false })
    .eq('tenant_id', tenantId)
    .eq('unpublished_by_billing', true)
    .select(RESTORED_EDITION_COLUMNS)

  const republished = restoredNewsletters ?? []

  // Sin esto, el archivo del cliente que acaba de volver a pagar sigue
  // apareciendo vacío hasta que vencen los 5 minutos del perfil `hosted`.
  // Best-effort: no puede tumbar la reactivación.
  if (republished.length > 0) revalidateNewsletterPaths(tenantId)

  return {
    propertiesRepublished:  restoredCount,
    newslettersRepublished: republished.length,
  }
}
