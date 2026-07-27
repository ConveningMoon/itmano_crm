import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantAccess, type TenantAccess } from '@/lib/subscriptions/access'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

/** Lee la suscripción del tenant y devuelve su acceso. Una query barata. */
export async function getTenantAccessFor(tenantId: string): Promise<TenantAccess> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, billing_exempt')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data as any
  return getTenantAccess({
    plan:          (s?.plan as SubscriptionPlan) ?? 'esencial',
    status:        (s?.status as SubscriptionStatus) ?? 'active',
    billingExempt: (s?.billing_exempt as boolean) ?? false,
  })
}
