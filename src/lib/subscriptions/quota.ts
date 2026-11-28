import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscription } from '@/lib/data/subscriptions'
import { getEntitlements, type Entitlement } from '@/lib/subscriptions/entitlements'

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
 * Primer instante (UTC) del mes siguiente a `now`. A dónde se reprograma un run
 * de secuencia pausado por cuota: siempre queda a menos de 30 días de "ahora"
 * cuando llega, así que `isRunStale` no lo cierra. Date.UTC normaliza el
 * desborde de diciembre a enero del año siguiente.
 */
export function nextMonthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

/**
 * Derechos de correo con conteo FRESCO (nunca el `cache()` de getTenantUsage):
 * un lote que envía de a uno (cron de secuencias) o varios correos en el mismo
 * request vería un uso congelado y pasaría el tope. Es una consulta `head` y la
 * suscripción sale de getSubscription (cacheada, no cambia dentro del request).
 */
export async function getFreshEmailEntitlements(
  tenantId: string,
): Promise<{ automatedEmail: Entitlement; manualEmail: Entitlement }> {
  const subscription = await getSubscription(tenantId)
  const emailsMonth = await countMonthlyCorporateSends(
    tenantId, subscription?.degradedAt ?? null, windowTrialEnd(subscription),
  )
  const all = getEntitlements({
    // Sin fila de suscripción: Esencial activo, igual que el resto de gates.
    plan: subscription?.plan ?? 'esencial',
    status: subscription?.status ?? 'active',
    billingExempt: subscription?.billingExempt ?? false,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    usage: { leads: 0, agents: 0, publishedProperties: 0, emailsMonth },
  })
  return { automatedEmail: all.automatedEmail, manualEmail: all.manualEmail }
}

/**
 * Cupo mensual para envíos automáticos (masivos, open houses): el tope de
 * `automatedEmail` — el del plan o, en modo degradado, la cuota de cortesía.
 * Cuenta fresca; quien envía por lotes lo lee una vez y descuenta en memoria.
 * Un tenant `billing_exempt` no tiene tope (límite "infinito" seguro).
 */
export async function monthlyEmailAllowance(tenantId: string): Promise<{ limit: number; used: number }> {
  const { automatedEmail } = await getFreshEmailEntitlements(tenantId)
  return {
    limit: automatedEmail.limit ?? Number.MAX_SAFE_INTEGER,
    used: automatedEmail.used ?? 0,
  }
}

/**
 * Gate para los servicios de envío. Devuelve null si puede enviar, o un
 * `{ ok: false, error }` listo para retornar (mismo patrón que assertAiWithinLimit).
 * `manual` (un humano pulsó enviar) tiene 10 % de margen sobre el plan;
 * `automated` para exactamente en el tope. Rige siempre, con plan o degradado.
 */
export async function assertEmailQuota(
  tenantId: string,
  kind: 'manual' | 'automated' = 'manual',
): Promise<{ ok: false; error: string } | null> {
  const { automatedEmail, manualEmail } = await getFreshEmailEntitlements(tenantId)
  const entitlement = kind === 'manual' ? manualEmail : automatedEmail
  if (entitlement.allowed) return null
  const message = entitlement.message ?? 'Alcanzaste el límite mensual de correos de tu plan.'
  return {
    ok: false,
    error: kind === 'manual'
      ? `${message} Puedes seguir escribiendo a tus leads desde tu propio correo con la opción Personal.`
      : message,
  }
}
