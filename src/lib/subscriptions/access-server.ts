import 'server-only'
import { cache } from 'react'
import { getSubscription } from '@/lib/data/subscriptions'
import { getTenantAccess, type TenantAccess } from '@/lib/subscriptions/access'

/**
 * Lee la suscripción del tenant y devuelve su acceso.
 *
 * FALLA EN ABIERTO a propósito: si la lectura falla o no hay fila, se devuelve
 * acceso completo. De los dos errores posibles, cortarle el servicio a alguien
 * que paga es mucho más caro que darle servicio de más a alguien que no. Pero un
 * fallo persistente aquí desactivaría el enforcement entero sin síntoma, así que
 * getSubscription lo registra: ese log es la única señal.
 *
 * La fila sale de getSubscription, que el shell ya pide para el badge del plan.
 * Antes este helper leía la misma fila por su cuenta y cada página pagaba dos
 * round-trips idénticos. Ambos van envueltos en React cache(): media docena de
 * superficies lo llaman por request (el shell, el detalle de lead, los gates de
 * IA y de envío). Deduplicar es seguro porque nadie escribe `subscriptions` a
 * través de estos helpers — los escritores (webhook de Paddle, cron de ciclo de
 * vida, acciones de settings/admin) van directo a la tabla.
 */
export const getTenantAccessFor = cache(async function getTenantAccessFor(
  tenantId: string,
): Promise<TenantAccess> {
  const s = await getSubscription(tenantId)
  return getTenantAccess({
    plan:          s?.plan ?? 'esencial',
    status:        s?.status ?? 'active',
    billingExempt: s?.billingExempt ?? false,
  })
})
