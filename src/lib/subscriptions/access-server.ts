import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccess, type TenantAccess } from '@/lib/subscriptions/access'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

/**
 * Lee la suscripción del tenant y devuelve su acceso. Una query barata.
 *
 * FALLA EN ABIERTO a propósito: si la lectura falla o no hay fila, se devuelve
 * acceso completo. De los dos errores posibles, cortarle el servicio a alguien
 * que paga es mucho más caro que darle servicio de más a alguien que no. Pero un
 * fallo persistente aquí desactivaría el enforcement entero sin síntoma, así que
 * se registra: este log es la única señal.
 *
 * Envuelto en React cache(): media docena de superficies lo llaman por request
 * (el shell, el detalle de lead, los gates de IA y de envío) y todas quieren la
 * misma fila. Deduplicar es seguro porque nadie escribe `subscriptions` a través
 * de este helper — los escritores (webhook de Paddle, cron de ciclo de vida,
 * acciones de settings/admin) van directo a la tabla.
 */
export const getTenantAccessFor = cache(async function getTenantAccessFor(
  tenantId: string,
): Promise<TenantAccess> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, billing_exempt')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error(JSON.stringify({
      service: 'tenant-access', tenant_id: tenantId,
      error: error.message, fallback: 'full_access',
    }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return getTenantAccess({
    plan:          (s?.plan as SubscriptionPlan) ?? 'esencial',
    status:        (s?.status as SubscriptionStatus) ?? 'active',
    billingExempt: (s?.billing_exempt as boolean) ?? false,
  })
})
