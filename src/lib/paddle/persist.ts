import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { reduceSubscriptionEvent, type PaddleSubscriptionEvent, type SubscriptionSnapshot } from '@/lib/paddle/reducer'
import type { SubscriptionStatus } from '@/lib/subscriptions'

/**
 * Resuelve el tenant de un evento. El puente es `custom_data.tenant_id`, que se
 * fija al CREAR la transacción en el servidor y que Paddle copia a la
 * suscripción. Fallback por paddle_subscription_id para eventos posteriores
 * cuyo custom_data pudiera venir vacío.
 */
async function resolveTenantId(event: PaddleSubscriptionEvent): Promise<string | null> {
  const fromCustomData = event.customData?.tenant_id
  if (typeof fromCustomData === 'string' && fromCustomData) return fromCustomData

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('paddle_subscription_id', event.subscriptionId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
  return ((data as any)?.tenant_id as string | undefined) ?? null
}

export async function applySubscriptionEvent(
  event: PaddleSubscriptionEvent,
): Promise<'applied' | 'stale' | 'no_tenant'> {
  const tenantId = await resolveTenantId(event)
  if (!tenantId) return 'no_tenant'

  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('subscriptions')
    .select('status, last_event_at, degraded_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
  const r = row as any
  const snapshot: SubscriptionSnapshot = {
    status:      (r?.status as SubscriptionStatus) ?? 'active',
    lastEventAt: (r?.last_event_at as string | null) ?? null,
    degradedAt:  (r?.degraded_at as string | null) ?? null,
  }

  // El reductor es puro y decide si el evento es viejo (null) o produce un
  // patch. Se pasa el objeto entero al update — no se desarma campo por campo,
  // porque `plan` es una clave OPCIONAL que solo debe escribirse si vino.
  const patch = reduceSubscriptionEvent(event, snapshot)
  if (!patch) return 'stale'

  const { error } = await supabase.from('subscriptions').update(patch).eq('tenant_id', tenantId)
  if (error) throw new Error(`No se pudo aplicar el evento de Paddle: ${error.message}`)

  // Best-effort: marcar el evento como procesado en el log de auditoría. Si
  // esto falla no se revierte el update de arriba — el efecto de negocio ya
  // se aplicó y es lo que importa; processed_at es solo trazabilidad.
  await supabase
    .from('paddle_webhook_events')
    .update({ tenant_id: tenantId, processed_at: new Date().toISOString() })
    .eq('event_id', event.eventId)

  return 'applied'
}
