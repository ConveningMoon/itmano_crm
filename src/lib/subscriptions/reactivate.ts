import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ReactivationReport {
  propertiesRepublished: number
}

/**
 * Restaura lo que la degradación modificó. Hoy son solo las propiedades: los
 * runs de secuencia nunca cambiaron de estado (Task 12 Step 4), así que se
 * reanudan solos al volver a pasar el gate de suscripción — y la guardia de
 * frescura (isRunStale) impide que un envío vencido hace meses se dispare.
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

  return { propertiesRepublished: (restored ?? []).length }
}
