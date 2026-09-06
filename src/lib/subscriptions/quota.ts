import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'

// Cuota de envío CORPORATIVO (por Resend) en modo degradado. El modo Personal
// del composer (mailto:) NO pasa por aquí y es ilimitado a propósito: no toca
// Resend, no cuesta nada y no arriesga la reputación del dominio compartido.

/**
 * Inicio de la ventana de cuota. PURA para poder testearla sin base de datos.
 *
 * No basta con el 1º del mes: los envíos hechos ANTES de degradarse se hicieron
 * con la suscripción al día y no deben consumir la cuota de cortesía. Sin esto,
 * un tenant Growth que manda 5.000 correos del 1 al 20 y cancela el 20 se queda
 * con CERO envíos durante once días — lo contrario de lo que busca el modo
 * degradado, que existe para que el cliente siga siendo recuperable.
 */
export function quotaWindowStart(now: Date, degradedAt: string | null): string {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (!degradedAt) return monthStart.toISOString()
  const degraded = new Date(degradedAt)
  if (Number.isNaN(degraded.getTime())) return monthStart.toISOString()
  return (degraded > monthStart ? degraded : monthStart).toISOString()
}

export async function countMonthlyCorporateSends(
  tenantId: string,
  degradedAt: string | null,
): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('sent_at', quotaWindowStart(new Date(), degradedAt))
  return count ?? 0
}

/**
 * Gate para los servicios de envío. Devuelve null si puede enviar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que assertAiWithinLimit).
 *
 * Firma pública sin cambios (`tenantId` solamente): resuelve `degraded_at` con
 * una consulta propia en paralelo a `getTenantAccessFor` — ese helper es puro
 * respecto al acceso calculado y no expone la fecha cruda de degradación, así
 * que no se toca (Task 11) para obtenerla.
 */
export async function assertEmailQuota(
  tenantId: string,
): Promise<{ ok: false; error: string } | null> {
  const supabase = createAdminClient()
  const [access, { data: sub }] = await Promise.all([
    getTenantAccessFor(tenantId),
    supabase.from('subscriptions').select('degraded_at').eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (access.monthlyEmailQuota === null) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const degradedAt = ((sub as any)?.degraded_at as string | null) ?? null
  const used = await countMonthlyCorporateSends(tenantId, degradedAt)
  if (used < access.monthlyEmailQuota) return null

  return {
    ok: false,
    error: 'Alcanzaste el límite mensual de envíos de tu suscripción inactiva. Puedes seguir escribiendo a tus leads desde tu propio correo con la opción Personal, o reactivar tu suscripción.',
  }
}
