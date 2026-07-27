import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GRACE_DAYS, DEGRADED_LIMITS } from '@/lib/subscriptions/access'

// Los plazos de 14 y 60 dias no los dispara ningun webhook: hacen falta pasadas
// programadas. Diario, via cron-job.org (misma infraestructura que el
// orquestador de secuencias).
//
// Idempotente por construccion: cada paso reevalua el ESTADO ACTUAL (no un
// evento puntual), asi que un tenant ya procesado deja de cumplir la condicion
// por si solo y una repasada diaria no repite trabajo:
//   1. propiedades  -> el conteo de publicadas ya esta <= el tope, no hay nada
//      que despublicar de nuevo.
//   2. dominio      -> domain_status ya no es 'verified', no hay nada que
//      liberar de nuevo.
//   3. retencion    -> se busca si el aviso EXACTO ya existe antes de
//      insertarlo; si no se hiciera esta comprobacion, el aviso se reinsertaria
//      cada dia entre el mes 11 y el 12 (~30 notificaciones) en vez de una sola.
//
// En los tres pasos, `billing_exempt = true` (piloto A&J) queda fuera del
// filtro SQL desde el origen: nunca llega a evaluarse el resto de la logica.

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

// Aviso de retencion: mensaje fijo para poder detectar si ya se envio (ver
// paso 3). Cambiar el texto crea, en la practica, un aviso "nuevo" — se deja
// como constante para que quede claro que ambos usos deben coincidir.
const RETENTION_WARNING_MESSAGE =
  'Este equipo lleva 11 meses cancelado. La politica de retencion elimina sus datos al cumplirse 12.'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const report = { propertiesUnpublished: 0, domainsReleased: 0, retentionWarnings: 0 }

  // ── 1. Propiedades: gracia de 14 dias agotada ───────────────────────────────
  const { data: overdueProps } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .in('status', ['paused', 'cancelled'])
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(GRACE_DAYS.properties))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (overdueProps ?? []) as any[]) {
    const { data: published } = await supabase
      .from('properties')
      .select('id')
      .eq('tenant_id', row.tenant_id)
      .eq('published_to_web', true)
      .order('updated_at', { ascending: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (published ?? []) as any[]
    if (all.length <= DEGRADED_LIMITS.publishedPropertiesCap) continue

    // Regla determinista: se conservan las mas recientemente actualizadas.
    // NO destructivo — la fila, las fotos y el slug quedan intactos.
    const toUnpublish = all.slice(DEGRADED_LIMITS.publishedPropertiesCap).map(p => p.id)
    const { error } = await supabase
      .from('properties')
      .update({ published_to_web: false, unpublished_by_billing: true })
      .in('id', toUnpublish)
    if (!error) report.propertiesUnpublished += toUnpublish.length
  }

  // ── 2. Dominio: gracia de 60 dias agotada ───────────────────────────────────
  // Hasta aqui el dominio siguio registrado en Resend para que la reactivacion
  // fuera instantanea y los replies en vuelo siguieran llegando.
  const { data: overdueDomains } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .in('status', ['paused', 'cancelled'])
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(GRACE_DAYS.sendingDomain))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (overdueDomains ?? []) as any[]) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, domain_status')
      .eq('id', row.tenant_id)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((tenant as any)?.domain_status !== 'verified') continue

    // 'released' es el estado terminal: reactivar exigira re-verificar el DNS.
    // Nota: esto NO borra el dominio de la cuenta de Resend (eso exige la API
    // de Resend Domains); solo corta su uso desde el CRM. El slot queda
    // identificable para liberarlo a mano desde el panel de Resend.
    const { error } = await supabase
      .from('tenants')
      .update({ domain_status: 'released' })
      .eq('id', row.tenant_id)
    if (!error) report.domainsReleased += 1
  }

  // ── 3. Retencion: aviso a los 11 meses ──────────────────────────────────────
  const { data: oldCancelled } = await supabase
    .from('subscriptions')
    .select('tenant_id')
    .eq('status', 'cancelled')
    .eq('billing_exempt', false)
    .lte('degraded_at', daysAgoIso(330))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (oldCancelled ?? []) as any[]) {
    // La condicion SQL de arriba (degraded_at <= hace 330 dias) sigue siendo
    // verdadera todos los dias entre el mes 11 y el mes 12: sin este chequeo
    // se reinsertaria el mismo aviso en cada pasada diaria. Se comprueba si el
    // aviso EXACTO ya existe para este tenant y, si es asi, no se repite —
    // la idempotencia sale de una condicion (¿ya existe?), no de un flag nuevo.
    const { data: existingWarning } = await supabase
      .from('notifications')
      .select('id')
      .eq('tenant_id', row.tenant_id)
      .eq('type', 'subscription_request')
      .eq('message', RETENTION_WARNING_MESSAGE)
      .limit(1)

    if (existingWarning && existingWarning.length > 0) continue

    const { error } = await supabase.from('notifications').insert({
      tenant_id: row.tenant_id,
      type:      'subscription_request',
      message:   RETENTION_WARNING_MESSAGE,
      read:      false,
      agent_id:  null,
    })
    if (!error) report.retentionWarnings += 1
  }

  return NextResponse.json({ ok: true, ...report })
}
