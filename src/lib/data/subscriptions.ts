import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionPlan, SubscriptionStatus, TenantSubscription } from '@/lib/subscriptions'

// Lectura de la suscripción de un tenant (fila única en `subscriptions`).
export async function getSubscription(tenantId: string): Promise<TenantSubscription | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, requested_plan, trial_ends_at, billing_cycle, current_period_end, cancel_at, paddle_price_id, paddle_customer_id, billing_exempt, degraded_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return {
    plan:             s.plan as SubscriptionPlan,
    status:           s.status as SubscriptionStatus,
    requestedPlan:    (s.requested_plan as SubscriptionPlan | null) ?? null,
    trialEndsAt:      (s.trial_ends_at as string | null) ?? null,
    billingCycle:     (s.billing_cycle as TenantSubscription['billingCycle']) ?? null,
    currentPeriodEnd: (s.current_period_end as string | null) ?? null,
    cancelAt:         (s.cancel_at as string | null) ?? null,
    paddlePriceId:    (s.paddle_price_id as string | null) ?? null,
    paddleCustomerId: (s.paddle_customer_id as string | null) ?? null,
    billingExempt:    (s.billing_exempt as boolean | null) ?? false,
    degradedAt:       (s.degraded_at as string | null) ?? null,
  }
}
