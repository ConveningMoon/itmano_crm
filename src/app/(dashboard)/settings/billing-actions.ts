'use server'

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { createCheckoutTransaction, createPortalUrl } from '@/lib/paddle/checkout'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { BillingCycle } from '@/lib/paddle/env'

const PLAN_VALUES: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function startCheckout(
  plan: string,
  cycle: string,
): Promise<Result<{ transactionId: string }>> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un equipo desde el centro de control.' }

  if (!PLAN_VALUES.includes(plan as SubscriptionPlan)) return { ok: false, error: 'Plan inválido.' }
  if (cycle !== 'month' && cycle !== 'year') return { ok: false, error: 'Ciclo de facturación inválido.' }

  try {
    const data = await createCheckoutTransaction(tenantId, plan as SubscriptionPlan, cycle as BillingCycle)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo iniciar el proceso.' }
  }
}

export async function openBillingPortal(): Promise<Result<{ url: string }>> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un equipo desde el centro de control.' }

  try {
    const url = await createPortalUrl(tenantId)
    return { ok: true, data: { url } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo abrir el portal.' }
  }
}
