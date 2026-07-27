import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaddle, resolveStandardPriceId, type BillingCycle } from '@/lib/paddle/env'
import type { SubscriptionPlan } from '@/lib/subscriptions'

/**
 * Crea la transacción EN EL SERVIDOR y devuelve su id para que el navegador
 * abra el overlay con `Paddle.Checkout.open({ transactionId })`.
 *
 * Por qué server-side y no `items:[{priceId}]` desde el cliente (spec §2):
 *   1. Partner tiene precio por trato, guardado en subscriptions.paddle_price_id.
 *      Solo el servidor lo conoce; exponerlo al navegador sería filtrarlo.
 *   2. El tenant_id no puede venir del cliente — se inyecta como custom_data
 *      desde la sesión autenticada, y Paddle lo copia a la suscripción.
 *   3. Abrir el checkout con customer.id obliga a pasar además los ids de
 *      address y business; con transactionId no hace falta.
 */
export async function createCheckoutTransaction(
  tenantId: string,
  plan: SubscriptionPlan,
  cycle: BillingCycle,
): Promise<{ transactionId: string }> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('paddle_price_id, paddle_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  // Partner: precio negociado en la fila. Esencial/Growth: catálogo estándar.
  const priceId = plan === 'partner'
    ? (r?.paddle_price_id as string | null)
    : resolveStandardPriceId(plan, cycle)

  if (!priceId) {
    throw new Error(
      plan === 'partner'
        ? 'Este equipo aún no tiene una inversión Partner asignada. Contacta a ITMANO.'
        : 'La configuración de planes no está completa. Contacta a ITMANO.',
    )
  }

  const customerId = (r?.paddle_customer_id as string | null) ?? undefined

  // custom_data es el puente con el webhook: Paddle lo copia de la transacción
  // a la suscripción. Va el tenant_id (para saber a quién pertenece) y el plan
  // (para saber qué compró — este es el único punto del sistema que lo sabe con
  // certeza, incluido Partner, cuyo precio es a medida y no está en ningún env).
  const txn = await getPaddle().transactions.create({
    items: [{ priceId, quantity: 1 }],
    ...(customerId ? { customerId } : {}),
    customData: { tenant_id: tenantId, plan },
  })

  return { transactionId: txn.id }
}

/**
 * URL autenticada del portal de cliente de Paddle (cambiar tarjeta, ver
 * facturas, cancelar). Es de UN SOLO USO y vida corta: se genera on-demand y
 * nunca se cachea ni se persiste.
 */
export async function createPortalUrl(tenantId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('paddle_customer_id, paddle_subscription_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any
  const customerId = r?.paddle_customer_id as string | null
  if (!customerId) throw new Error('Este equipo todavía no tiene una suscripción activa en Paddle.')

  const subscriptionId = r?.paddle_subscription_id as string | null
  const session = await getPaddle().customerPortalSessions.create(
    customerId,
    subscriptionId ? [subscriptionId] : [],
  )

  return session.urls.general.overview
}
