import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionPlan, SubscriptionStatus, TenantSubscription } from '@/lib/subscriptions'

// Lectura de la suscripción de un tenant (fila única en `subscriptions`).
// Deduplicada por request con React cache() — misma razón que getTenantAccessFor.

/**
 * Resultado de la lectura que distingue "no hay fila" (`subscription: null`,
 * `failed: false`) de "la lectura falló" (`failed: true`). El código de límites
 * lo necesita: tratar un error transitorio como "Esencial activo" bloquearía a
 * un tenant de pago y, en automatizaciones, reprogramaría sus runs al mes
 * siguiente sin que nada los reanude.
 */
export interface SubscriptionRead {
  subscription: TenantSubscription | null
  failed: boolean
}

export const getSubscriptionRead = cache(async function getSubscriptionRead(
  tenantId: string,
): Promise<SubscriptionRead> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, status, requested_plan, trial_ends_at, billing_cycle, current_period_end, cancel_at, paddle_price_id, paddle_customer_id, paddle_subscription_id, billing_exempt, degraded_at, over_cap_since')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  // getTenantAccessFor y el límite de IA leen de aquí y fallan en abierto: este
  // log es la única señal de que el enforcement quedó desactivado.
  if (error) {
    console.error(JSON.stringify({
      service: 'tenant-access', tenant_id: tenantId,
      error: error.message, fallback: 'full_access',
    }))
  }
  if (error) return { subscription: null, failed: true }
  if (!data) return { subscription: null, failed: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return { failed: false, subscription: {
    plan:             s.plan as SubscriptionPlan,
    status:           s.status as SubscriptionStatus,
    requestedPlan:    (s.requested_plan as SubscriptionPlan | null) ?? null,
    trialEndsAt:      (s.trial_ends_at as string | null) ?? null,
    billingCycle:     (s.billing_cycle as TenantSubscription['billingCycle']) ?? null,
    currentPeriodEnd: (s.current_period_end as string | null) ?? null,
    cancelAt:         (s.cancel_at as string | null) ?? null,
    paddlePriceId:    (s.paddle_price_id as string | null) ?? null,
    paddleCustomerId: (s.paddle_customer_id as string | null) ?? null,
    paddleSubscriptionId: (s.paddle_subscription_id as string | null) ?? null,
    billingExempt:    (s.billing_exempt as boolean | null) ?? false,
    degradedAt:       (s.degraded_at as string | null) ?? null,
    overCapSince:     (s.over_cap_since as string | null) ?? null,
  } }
})

// Los llamadores existentes siguen viendo `null` ante error o ausencia de fila.
export async function getSubscription(tenantId: string): Promise<TenantSubscription | null> {
  return (await getSubscriptionRead(tenantId)).subscription
}
