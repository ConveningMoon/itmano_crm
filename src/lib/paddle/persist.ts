import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { reduceSubscriptionEvent, type PaddleSubscriptionEvent, type SubscriptionSnapshot } from '@/lib/paddle/reducer'
import type { SubscriptionStatus, SubscriptionPlan } from '@/lib/subscriptions'
import { planAiBudgetUsd } from '@/lib/services/ai-budget'
import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'
import { notifyDegradation } from '@/lib/subscriptions/notify-degradation'

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
  const { data, error } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('paddle_subscription_id', event.subscriptionId)
    .maybeSingle()
  // Tragar este error devolvería 'no_tenant' → 200 → Paddle deja de reintentar y
  // el evento se pierde por un fallo puramente transitorio de lectura.
  if (error) throw new Error(`No se pudo resolver el tenant del evento: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
  return ((data as any)?.tenant_id as string | undefined) ?? null
}

export async function applySubscriptionEvent(
  event: PaddleSubscriptionEvent,
): Promise<'applied' | 'stale' | 'no_tenant'> {
  const tenantId = await resolveTenantId(event)
  if (!tenantId) {
    // 'no_tenant' acaba en un 200 (Paddle no debe reintentar algo que nunca va a
    // resolverse solo), así que este log es la ÚNICA señal de que pasó. La fila
    // de paddle_webhook_events conserva el payload íntegro con processed_at NULL
    // y es recuperable a mano — pero solo si alguien se entera.
    console.error(JSON.stringify({
      service: 'paddle-webhook', event_id: event.eventId, event_type: event.eventType,
      subscription_id: event.subscriptionId, error: 'no_tenant',
    }))
    return 'no_tenant'
  }

  const supabase = createAdminClient()
  const { data: row, error: readError } = await supabase
    .from('subscriptions')
    .select('status, last_event_at, degraded_at, plan')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  // Un fallo de lectura NO puede degradar a los defaults: con lastEventAt null
  // se desactiva la guardia de orden del reductor, y con degradedAt null se
  // reinician los relojes de 14 y 60 días — justo el defecto que la Task 5
  // arregló, reintroducido por otra puerta. Mejor 500 y que Paddle reintente.
  if (readError) throw new Error(`No se pudo leer la suscripción de ${tenantId}: ${readError.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
  const r = row as any
  const snapshot: SubscriptionSnapshot = {
    status:      (r?.status as SubscriptionStatus) ?? 'active',
    lastEventAt: (r?.last_event_at as string | null) ?? null,
    degradedAt:  (r?.degraded_at as string | null) ?? null,
  }
  // El plan ANTERIOR no entra en el snapshot del reductor (que es puro y sólo
  // razona sobre estado y fechas): se lee aparte para detectar el cambio.
  const planAnterior = (r?.plan as SubscriptionPlan | undefined) ?? null

  // El reductor es puro y decide si el evento es viejo (null) o produce un
  // patch. Se pasa el objeto entero al update — no se desarma campo por campo,
  // porque `plan` es una clave OPCIONAL que solo debe escribirse si vino.
  const patch = reduceSubscriptionEvent(event, snapshot)
  if (!patch) return 'stale'

  const { data: updated, error } = await supabase
    .from('subscriptions').update(patch).eq('tenant_id', tenantId).select('tenant_id')
  if (error) throw new Error(`No se pudo aplicar el evento de Paddle: ${error.message}`)
  // PostgREST NO devuelve error cuando el WHERE no encuentra filas. Sin este
  // chequeo, un cobro real contra un tenant sin fila en `subscriptions` se le
  // reportaría a Paddle como 200 OK y se marcaría processed_at, mintiendo en la
  // traza. Ocurre de verdad: el alta de tenant inserta la suscripción en
  // best-effort (admin/actions.ts), así que puede faltar.
  if (!updated?.length) throw new Error(`Sin fila de subscriptions para el tenant ${tenantId}`)

  // Cambio de plan: el presupuesto mensual de IA se mueve al del plan nuevo.
  //
  // Sólo en la TRANSICIÓN, nunca en cada evento: un `subscription.updated` de
  // renovación trae el mismo plan, y reescribir en cada uno pisaría el tope que
  // el super_admin haya ajustado a mano para ese cliente. Con esta guardia el
  // ajuste manual sobrevive a todo salvo a un cambio de plan real, que es
  // exactamente cuando debe recalcularse.
  //
  // Best-effort, igual que la reactivación: lo crítico —el estado de
  // facturación— ya quedó escrito, y un 500 aquí haría que Paddle reintente un
  // evento que el reductor va a descartar por viejo, así que el reintento no
  // arreglaría nada y este paso no volvería a ejecutarse jamás. El log es la
  // única señal.
  if (patch.plan && patch.plan !== planAnterior) {
    const { error: budgetError } = await supabase
      .from('tenants')
      .update({ ai_monthly_limit_usd: planAiBudgetUsd(patch.plan) })
      .eq('id', tenantId)
    if (budgetError) {
      console.error(JSON.stringify({
        service: 'paddle-plan-budget', tenant_id: tenantId, event_id: event.eventId,
        from: planAnterior, to: patch.plan, error: budgetError.message,
      }))
    }
  }

  // Reactivación: detecta la TRANSICIÓN (estaba degradado y este evento lo
  // devuelve a activo), nunca solo el estado nuevo — si se mirara únicamente
  // `patch.degraded_at === null` se dispararía en cada evento posterior a la
  // reactivación (ya viene null y seguiría viniendo null). `snapshot.degradedAt`
  // es el estado ANTES de este evento, así que la combinación de ambos aísla
  // el instante exacto en que el tenant vuelve a estar al día.
  if (snapshot.degradedAt && patch.degraded_at === null) {
    try {
      await restoreAfterReactivation(tenantId)
    } catch (err) {
      // NO se relanza a propósito. El estado de FACTURACIÓN (lo crítico) ya
      // quedó bien escrito arriba — devolver 500 aquí no lo arregla, y además
      // sería contraproducente: en el reintento de Paddle el reductor
      // descartaría este mismo evento por `occurred_at <= last_event_at` (ya
      // quedó grabado en el intento que sí llegó hasta acá) y la restauración
      // jamás volvería a intentarse. Preferimos un webhook en 200 con un log
      // inequívoco a un 500 que reintenta infinitamente sin poder tener éxito.
      // Este log es la ÚNICA señal de que un cliente que ya paga tiene sus
      // propiedades aún despublicadas — no hay retry automático para esto.
      console.error(JSON.stringify({
        service: 'paddle-reactivation', tenant_id: tenantId, event_id: event.eventId,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }

  // Entrada al modo degradado: detecta la TRANSICIÓN (no estaba degradado y
  // este evento lo degrada), nunca solo el estado nuevo — mismo motivo que la
  // reactivación de arriba: mirar solo `patch.degraded_at !== null` dispararía
  // el aviso en cada evento posterior mientras el tenant siga degradado (sigue
  // viniendo no-null). `snapshot.degradedAt` es el estado ANTES de este
  // evento, así que la combinación aísla el instante exacto de la degradación.
  if (!snapshot.degradedAt && patch.degraded_at !== null) {
    try {
      await notifyDegradation(tenantId, patch.status)
    } catch (err) {
      // NO se relanza, por la misma razón que la reactivación: el estado de
      // FACTURACIÓN ya quedó bien escrito arriba, y un 500 aquí solo lograría
      // que Paddle reintente un evento que el reductor descartaría como viejo
      // sin volver a intentar nunca la notificación. Preferimos un 200 con un
      // log inequívoco a un reintento infinito que no puede tener éxito.
      console.error(JSON.stringify({
        service: 'paddle-degradation-notify', tenant_id: tenantId, event_id: event.eventId,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }

  // Best-effort: marcar el evento como procesado en el log de auditoría. Si
  // esto falla no se revierte el update de arriba — el efecto de negocio ya
  // se aplicó y es lo que importa; processed_at es solo trazabilidad.
  await supabase
    .from('paddle_webhook_events')
    .update({ tenant_id: tenantId, processed_at: new Date().toISOString() })
    .eq('event_id', event.eventId)

  return 'applied'
}
