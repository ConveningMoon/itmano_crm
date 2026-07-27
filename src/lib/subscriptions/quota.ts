import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'

// Cuota de envío CORPORATIVO (por Resend) en modo degradado. El modo Personal
// del composer (mailto:) NO pasa por aquí y es ilimitado a propósito: no toca
// Resend, no cuesta nada y no arriesga la reputación del dominio compartido.

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function countMonthlyCorporateSends(tenantId: string): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('sent_at', monthStartIso())
  return count ?? 0
}

/**
 * Gate para los servicios de envío. Devuelve null si puede enviar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que assertAiWithinLimit).
 */
export async function assertEmailQuota(
  tenantId: string,
): Promise<{ ok: false; error: string } | null> {
  const access = await getTenantAccessFor(tenantId)
  if (access.monthlyEmailQuota === null) return null

  const used = await countMonthlyCorporateSends(tenantId)
  if (used < access.monthlyEmailQuota) return null

  return {
    ok: false,
    error: 'Alcanzaste el límite mensual de envíos de tu suscripción inactiva. Puedes seguir escribiendo a tus leads desde tu propio correo con la opción Personal, o reactivar tu suscripción.',
  }
}
