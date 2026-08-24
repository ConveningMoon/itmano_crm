import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { revalidateNewsletterPaths, type RevalidatableEdition } from '@/lib/newsletters/revalidate'

const RESTORED_EDITION_COLUMNS = columns('newsletter_editions', ['id', 'slug', 'channel_id'])

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
export async function restoreAfterReactivation(tenantId: string): Promise<ReactivationReport> {
  const supabase = createAdminClient()

  // Republicar SOLO lo que despublicó el sistema (unpublished_by_billing =
  // true). Sin este filtro se republicaría una casa que el cliente quitó a
  // propósito por estar vendida — la diferencia entre restaurar y meter la
  // pata en la web pública del cliente.
  const { data: restored } = await supabase
    .from('properties')
    .update({ published_to_web: true, unpublished_by_billing: false })
    .eq('tenant_id', tenantId)
    .eq('unpublished_by_billing', true)
    .select('id')

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

  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const republished = ((restoredNewsletters ?? []) as any[]) as RevalidatableEdition[]

  // Sin esto, el archivo del cliente que acaba de volver a pagar sigue
  // apareciendo vacío hasta que expire la ventana de ISR (300 s en las tres
  // rutas). Best-effort: no puede tumbar la reactivación.
  if (republished.length > 0) await revalidateNewsletterPaths(supabase, tenantId, republished)

  return {
    propertiesRepublished:  (restored ?? []).length,
    newslettersRepublished: republished.length,
  }
}
