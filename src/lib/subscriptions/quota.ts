import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscription } from '@/lib/data/subscriptions'
import { PLANS } from '@/lib/plans'
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
export function quotaWindowStart(
  now: Date,
  degradedAt: string | null,
  trialEndsAt: string | null = null,
): string {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (!degradedAt) {
    // Prueba vencida que el cron aún no marcó como degradada: getTenantAccess ya
    // la trata como degradada, así que su cuota de cortesía arranca al vencer la
    // prueba y no cuenta los envíos hechos mientras era válida.
    const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null
    if (trialEnd && !Number.isNaN(trialEnd.getTime()) && trialEnd < now && trialEnd > monthStart) {
      return trialEnd.toISOString()
    }
    return monthStart.toISOString()
  }
  const degraded = new Date(degradedAt)
  if (Number.isNaN(degraded.getTime())) return monthStart.toISOString()
  return (degraded > monthStart ? degraded : monthStart).toISOString()
}

/**
 * trialEndsAt sólo mueve la ventana mientras la suscripción SIGUE en prueba
 * (misma regla que getTenantAccess). Un tenant que ya pagó conserva un
 * trial_ends_at viejo; usarlo subcontaría sus correos y le dejaría pasar el tope.
 */
export function windowTrialEnd(
  sub: { status: string; trialEndsAt: string | null } | null | undefined,
): string | null {
  return sub?.status === 'trial' ? sub.trialEndsAt : null
}

export async function countMonthlyCorporateSends(
  tenantId: string,
  degradedAt: string | null,
  trialEndsAt: string | null = null,
): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('sent_at', quotaWindowStart(new Date(), degradedAt, trialEndsAt))
  return count ?? 0
}

/**
 * Cupo mensual de un envío masivo. A diferencia de assertEmailQuota, aquí sí
 * rige `emailsPerMonth` del plan: un solo clic puede gastar el mes entero, así
 * que el límite contractual deja de depender de que alguien lo vigile. En modo
 * degradado manda la cuota de cortesía, que es menor.
 */
export async function monthlyEmailAllowance(tenantId: string): Promise<{ limit: number; used: number }> {
  const [access, subscription] = await Promise.all([
    getTenantAccessFor(tenantId),
    getSubscription(tenantId),
  ])
  const used = await countMonthlyCorporateSends(
    tenantId, subscription?.degradedAt ?? null, windowTrialEnd(subscription),
  )
  const limit = access.monthlyEmailQuota ?? PLANS[subscription?.plan ?? 'esencial'].limits.emailsPerMonth
  return { limit, used }
}

/**
 * Gate para los servicios de envío. Devuelve null si puede enviar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que assertAiWithinLimit).
 * `degradedAt` sale de getSubscription (cacheada), sin consulta propia.
 */
export async function assertEmailQuota(
  tenantId: string,
): Promise<{ ok: false; error: string } | null> {
  const [access, subscription] = await Promise.all([
    getTenantAccessFor(tenantId),
    getSubscription(tenantId),
  ])
  if (access.monthlyEmailQuota === null) return null

  const used = await countMonthlyCorporateSends(
    tenantId, subscription?.degradedAt ?? null, windowTrialEnd(subscription),
  )
  if (used < access.monthlyEmailQuota) return null

  return {
    ok: false,
    error: 'Alcanzaste el límite mensual de envíos de tu suscripción inactiva. Puedes seguir escribiendo a tus leads desde tu propio correo con la opción Personal, o reactivar tu suscripción.',
  }
}
