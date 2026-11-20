'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { createCheckoutTransaction, createPortalUrl } from '@/lib/paddle/checkout'
import {
  cancelAtPeriodEnd, changePlan, previewPlanChange, resumeSubscription, type PlanChangePreview,
} from '@/lib/paddle/manage'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { BillingCycle } from '@/lib/paddle/env'

const PLAN_VALUES: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

// Facturación: sólo quien administra el equipo. El tenant sale SIEMPRE de la
// sesión, nunca del cliente.
async function billingTenant(): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  if (ctx.role !== 'agent_owner' && ctx.role !== 'super_admin') {
    return { ok: false, error: 'Sólo quien administra el equipo puede gestionar la suscripción.' }
  }
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un equipo desde el centro de control.' }
  return { ok: true, tenantId: ctx.tenant_id }
}

function parsePlanCycle(plan: string, cycle: string): { ok: true; plan: SubscriptionPlan; cycle: BillingCycle } | { ok: false; error: string } {
  if (!PLAN_VALUES.includes(plan as SubscriptionPlan)) return { ok: false, error: 'Plan inválido.' }
  if (cycle !== 'month' && cycle !== 'year') return { ok: false, error: 'Ciclo de facturación inválido.' }
  return { ok: true, plan: plan as SubscriptionPlan, cycle }
}

export async function startCheckout(
  plan: string,
  cycle: string,
): Promise<Result<{ transactionId: string }>> {
  const t = await billingTenant()
  if (!t.ok) return t
  const parsed = parsePlanCycle(plan, cycle)
  if (!parsed.ok) return parsed

  try {
    const data = await createCheckoutTransaction(t.tenantId, parsed.plan, parsed.cycle)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo iniciar el proceso.' }
  }
}

export async function openBillingPortal(): Promise<Result<{ url: string }>> {
  const t = await billingTenant()
  if (!t.ok) return t

  try {
    const url = await createPortalUrl(t.tenantId)
    return { ok: true, data: { url } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo abrir el portal.' }
  }
}

/** Cuánto se cobra (o queda a favor) al cambiar de plan, antes de confirmar. */
export async function previewPlanChangeAction(plan: string, cycle: string): Promise<Result<PlanChangePreview>> {
  const t = await billingTenant()
  if (!t.ok) return t
  const parsed = parsePlanCycle(plan, cycle)
  if (!parsed.ok) return parsed
  return previewPlanChange(t.tenantId, parsed.plan, parsed.cycle)
}

// El estado nuevo lo escribe el webhook de Paddle; revalidar sólo adelanta que
// la página lo muestre en cuanto llegue.
export async function changePlanAction(plan: string, cycle: string): Promise<Result<null>> {
  const t = await billingTenant()
  if (!t.ok) return t
  const parsed = parsePlanCycle(plan, cycle)
  if (!parsed.ok) return parsed
  const res = await changePlan(t.tenantId, parsed.plan, parsed.cycle)
  if (res.ok) revalidatePath('/settings')
  return res
}

export async function cancelSubscriptionAction(): Promise<Result<null>> {
  const t = await billingTenant()
  if (!t.ok) return t
  const res = await cancelAtPeriodEnd(t.tenantId)
  if (res.ok) revalidatePath('/settings')
  return res
}

export async function resumeSubscriptionAction(): Promise<Result<null>> {
  const t = await billingTenant()
  if (!t.ok) return t
  const res = await resumeSubscription(t.tenantId)
  if (res.ok) revalidatePath('/settings')
  return res
}
