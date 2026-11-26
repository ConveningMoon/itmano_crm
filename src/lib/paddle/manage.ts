import 'server-only'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { catalogPrices, getPaddle } from '@/lib/paddle/env'
import {
  extraSeats, formatPaddleAmount, isSeatPrice, negotiatedPartnerPrice, subscriptionItems, type Cycle,
} from '@/lib/paddle/items'
import { cancelBlock, planChangeBlock, resumeBlock, type BillingRow } from '@/lib/paddle/self-service'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

// Autoservicio de la suscripción en Paddle (fase 5 del plan SaaS): cambiar de
// plan o de ciclo, cancelar al final del período, reactivar y mantener los
// asientos de Partner iguales a los logins. El webhook de Paddle es quien
// escribe `subscriptions`: aquí sólo se le pide el cambio a Paddle, y el CRM
// se entera por el evento `subscription.updated` (fuente única de verdad).
//
// Los errores del SDK no salen al navegador: traen detalle en inglés y a veces
// ids de precio. Se registran completos y al cliente le llega un mensaje claro.

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const GENERIC_ERROR = 'No se pudo completar el cambio en Paddle. Intenta de nuevo o escríbenos.'

/** Logins del equipo: owner + agentes con acceso (los mismos que cuenta el panel). */
export async function countTenantLogins(db: SupabaseClient, tenantId: string): Promise<number> {
  const { count, error } = await db
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('role', ['agent_owner', 'agent'])
  if (error) throw new Error(`No se pudieron contar los logins: ${error.message}`)
  return count ?? 0
}

async function loadBillingRow(db: SupabaseClient, tenantId: string): Promise<BillingRow | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('plan, status, billing_exempt, billing_cycle, paddle_subscription_id, paddle_price_id, cancel_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la suscripción: ${error.message}`)
  if (!data) return null
  const r = data as {
    plan: SubscriptionPlan; status: SubscriptionStatus; billing_exempt: boolean | null; billing_cycle: Cycle | null
    paddle_subscription_id: string | null; paddle_price_id: string | null; cancel_at: string | null
  }
  return {
    plan:                 r.plan,
    status:               r.status,
    billingExempt:        !!r.billing_exempt,
    billingCycle:         r.billing_cycle,
    paddleSubscriptionId: r.paddle_subscription_id,
    cancelAt:             r.cancel_at,
    negotiatedPriceId:    negotiatedPartnerPrice(r.plan, r.paddle_price_id, catalogPrices()),
  }
}

function logPaddleError(op: string, tenantId: string, err: unknown) {
  console.error(JSON.stringify({ service: 'paddle-self-service', op, tenant_id: tenantId, error: err instanceof Error ? err.message : String(err) }))
}

async function planChangeRequest(db: SupabaseClient, tenantId: string, plan: SubscriptionPlan, cycle: Cycle) {
  const row = await loadBillingRow(db, tenantId)
  if (!row) return { ok: false as const, error: 'Este equipo no tiene una suscripción registrada.' }
  const blocked = planChangeBlock(row, plan, cycle)
  if (blocked) return { ok: false as const, error: blocked }
  const items = subscriptionItems({ plan, cycle, logins: await countTenantLogins(db, tenantId), prices: catalogPrices() })
  if (!items.ok) return { ok: false as const, error: 'La configuración de planes no está completa. Escríbenos.' }
  return {
    ok: true as const,
    subscriptionId: row.paddleSubscriptionId as string,
    body: {
      items: items.items,
      // Prorrateo inmediato en las dos direcciones: subir cobra la diferencia
      // ahora; bajar deja un crédito que Paddle descuenta de los próximos cobros.
      prorationBillingMode: 'prorated_immediately' as const,
      // El webhook lee el plan de aquí (y del precio de catálogo).
      customData: { tenant_id: tenantId, plan },
    },
  }
}

export interface PlanChangePreview {
  /** 'charge' = se cobra ahora; 'credit' = queda a favor para los próximos cobros. */
  action:    'charge' | 'credit'
  amount:    string
  /** Lo que se cobrará en cada renovación con el plan nuevo. */
  recurring: string | null
}

export async function previewPlanChange(tenantId: string, plan: SubscriptionPlan, cycle: Cycle): Promise<Result<PlanChangePreview>> {
  const db = createAdminClient()
  const req = await planChangeRequest(db, tenantId, plan, cycle)
  if (!req.ok) return req
  try {
    const p = await getPaddle().subscriptions.previewUpdate(req.subscriptionId, req.body)
    const result = p.updateSummary?.result
    const recurring = p.recurringTransactionDetails?.totals
    return {
      ok: true,
      data: {
        action:    result?.action ?? 'charge',
        amount:    result ? formatPaddleAmount(result.amount, result.currencyCode) : formatPaddleAmount(0, 'USD'),
        recurring: recurring ? formatPaddleAmount(recurring.total, p.currencyCode) : null,
      },
    }
  } catch (err) {
    logPaddleError('preview', tenantId, err)
    return { ok: false, error: 'No se pudo calcular el cambio. Intenta de nuevo o escríbenos.' }
  }
}

export async function changePlan(tenantId: string, plan: SubscriptionPlan, cycle: Cycle): Promise<Result<null>> {
  const db = createAdminClient()
  const req = await planChangeRequest(db, tenantId, plan, cycle)
  if (!req.ok) return req
  try {
    await getPaddle().subscriptions.update(req.subscriptionId, req.body)
    return { ok: true, data: null }
  } catch (err) {
    logPaddleError('change_plan', tenantId, err)
    return { ok: false, error: GENERIC_ERROR }
  }
}

/** Cancela al final del período pagado: conserva el acceso hasta entonces. */
export async function cancelAtPeriodEnd(tenantId: string): Promise<Result<null>> {
  const row = await loadBillingRow(createAdminClient(), tenantId)
  if (!row) return { ok: false, error: 'Este equipo no tiene una suscripción registrada.' }
  const blocked = cancelBlock(row)
  if (blocked) return { ok: false, error: blocked }
  try {
    await getPaddle().subscriptions.cancel(row.paddleSubscriptionId as string, { effectiveFrom: 'next_billing_period' })
    return { ok: true, data: null }
  } catch (err) {
    logPaddleError('cancel', tenantId, err)
    return { ok: false, error: GENERIC_ERROR }
  }
}

/** Quita la cancelación programada: la suscripción sigue renovándose. */
export async function resumeSubscription(tenantId: string): Promise<Result<null>> {
  const row = await loadBillingRow(createAdminClient(), tenantId)
  if (!row) return { ok: false, error: 'Este equipo no tiene una suscripción registrada.' }
  const blocked = resumeBlock(row)
  if (blocked) return { ok: false, error: blocked }
  try {
    await getPaddle().subscriptions.update(row.paddleSubscriptionId as string, { scheduledChange: null })
    return { ok: true, data: null }
  } catch (err) {
    logPaddleError('resume', tenantId, err)
    return { ok: false, error: GENERIC_ERROR }
  }
}

export type SeatSyncOutcome = 'updated' | 'in_sync' | 'not_partner_catalog' | 'missing_seat_price' | 'error'

/**
 * Deja los asientos de un Partner de catálogo iguales a sus logins extra. Se
 * llama al dar o quitar acceso y en la pasada diaria de billing-lifecycle, que
 * corrige cualquier llamada que haya fallado. Nunca lanza.
 */
export async function syncPartnerSeats(tenantId: string, db: SupabaseClient = createAdminClient()): Promise<SeatSyncOutcome> {
  try {
    const row = await loadBillingRow(db, tenantId)
    if (!row || row.plan !== 'partner' || row.negotiatedPriceId || !row.paddleSubscriptionId || !row.billingCycle) return 'not_partner_catalog'
    if (row.status !== 'active' && row.status !== 'past_due') return 'not_partner_catalog'

    const prices = catalogPrices()
    const logins = await countTenantLogins(db, tenantId)
    const wanted = extraSeats(logins)
    const sub = await getPaddle().subscriptions.get(row.paddleSubscriptionId)
    const current = sub.items.filter(i => isSeatPrice(i.price?.id, prices)).reduce((n, i) => n + i.quantity, 0)
    if (current === wanted) return 'in_sync'

    const items = subscriptionItems({ plan: 'partner', cycle: row.billingCycle, logins, prices })
    if (!items.ok) return items.reason === 'missing_seat_price' ? 'missing_seat_price' : 'error'
    // Se conservan los ítems que no son de catálogo (p. ej. un add-on puesto a
    // mano en Paddle): el update reemplaza la lista completa.
    const base = new Set(items.items.map(i => i.priceId))
    const others = sub.items
      .filter(i => i.price?.id && !base.has(i.price.id) && !isSeatPrice(i.price.id, prices) && i.price.id !== prices.plans.partner[row.billingCycle as Cycle])
      .map(i => ({ priceId: i.price!.id, quantity: i.quantity }))
    await getPaddle().subscriptions.update(row.paddleSubscriptionId, {
      items: [...items.items, ...others],
      prorationBillingMode: 'prorated_immediately',
    })
    console.log(JSON.stringify({ service: 'paddle-seats', tenant_id: tenantId, from: current, to: wanted }))
    return 'updated'
  } catch (err) {
    logPaddleError('sync_seats', tenantId, err)
    return 'error'
  }
}

/**
 * Sincroniza los asientos sin hacer esperar a quien dio o quitó el acceso. Si
 * falla, la pasada diaria de billing-lifecycle lo corrige.
 */
export function scheduleSeatSync(tenantId: string): void {
  after(async () => { await syncPartnerSeats(tenantId) })
}
