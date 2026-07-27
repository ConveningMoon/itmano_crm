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
//   3. retencion    -> se busca si ya existe un aviso de este ciclo de
//      degradacion antes de insertar (ver comentario junto al chequeo).
//
// En los tres pasos, `billing_exempt = true` (piloto A&J) queda fuera del
// filtro SQL desde el origen: nunca llega a evaluarse el resto de la logica.
//
// Esta es la unica pieza del sistema que modifica datos del cliente sin que
// nadie la este mirando en el momento — por eso cada paso corre aislado (un
// paso que falla no impide los otros dos) y cada fila corre aislada dentro de
// su paso (un tenant que lanza una excepcion no bloquea al resto), y cada
// error que hoy se ignoraba en silencio queda registrado con console.error
// para que Vercel lo capture antes de que lo note un cliente.

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function logError(step: string, tenantId: string | null, error: unknown): void {
  console.error(JSON.stringify({
    service:   'billing-lifecycle',
    step,
    tenant_id: tenantId,
    error:     error instanceof Error ? error.message : String(error),
  }))
}

// Aviso de retencion: mensaje fijo de cara al cliente. La idempotencia del
// paso 3 NO depende de este texto (ver el chequeo junto a su insercion) para
// que retocar el copy no reabra la ventana de duplicados.
const RETENTION_WARNING_MESSAGE =
  'Este equipo lleva 11 meses cancelado. La politica de retencion elimina sus datos al cumplirse 12.'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const report = {
    propertiesUnpublished: 0,
    domainsReleased:       0,
    retentionWarnings:     0,
    // Que pasos completaron su pasada vs. cuales abortaron por una excepcion en
    // la consulta base (no en una fila individual — eso se registra por log y
    // el paso sigue). Sin esto, el reporte no distingue "no habia nada que
    // hacer" de "fallo en silencio".
    steps: {
      properties: 'ok' as 'ok' | 'failed',
      domain:     'ok' as 'ok' | 'failed',
      retention:  'ok' as 'ok' | 'failed',
    },
  }

  // ── 1. Propiedades: gracia de 14 dias agotada ───────────────────────────────
  // Todo el paso va envuelto: si la excepcion ocurre en la consulta base (red,
  // timeout), los pasos 2 y 3 deben poder correr igual ese dia.
  try {
    const { data: overdueProps, error: overduePropsError } = await supabase
      .from('subscriptions')
      .select('tenant_id')
      .in('status', ['paused', 'cancelled'])
      .eq('billing_exempt', false)
      .lte('degraded_at', daysAgoIso(GRACE_DAYS.properties))

    if (overduePropsError) throw overduePropsError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (overdueProps ?? []) as any[]) {
      // Cada tenant aislado: si uno lanza (no solo si Supabase devuelve
      // { error }), el resto de tenants de este paso se siguen procesando.
      try {
        const { data: published, error: publishedError } = await supabase
          .from('properties')
          .select('id')
          .eq('tenant_id', row.tenant_id)
          .eq('published_to_web', true)
          .order('updated_at', { ascending: false })
          // Desempate deterministico: tras un import masivo es real que varias
          // filas compartan updated_at exacto, y sin un segundo criterio el
          // conjunto de "las 3 conservadas" podria variar entre pasadas.
          .order('id', { ascending: false })

        if (publishedError) throw publishedError

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (published ?? []) as any[]
        if (all.length <= DEGRADED_LIMITS.publishedPropertiesCap) continue

        // Regla determinista: se conservan las mas recientemente actualizadas
        // (con id como desempate). NO destructivo — la fila, las fotos y el
        // slug quedan intactos.
        const toUnpublish = all.slice(DEGRADED_LIMITS.publishedPropertiesCap).map(p => p.id)
        const { error } = await supabase
          .from('properties')
          .update({ published_to_web: false, unpublished_by_billing: true })
          .in('id', toUnpublish)

        if (error) {
          logError('properties', row.tenant_id, error)
          continue
        }
        report.propertiesUnpublished += toUnpublish.length
      } catch (err) {
        logError('properties', row.tenant_id, err)
      }
    }
  } catch (err) {
    logError('properties', null, err)
    report.steps.properties = 'failed'
  }

  // ── 2. Dominio: gracia de 60 dias agotada ───────────────────────────────────
  // Hasta aqui el dominio siguio registrado en Resend para que la reactivacion
  // fuera instantanea y los replies en vuelo siguieran llegando.
  try {
    const { data: overdueDomains, error: overdueDomainsError } = await supabase
      .from('subscriptions')
      .select('tenant_id')
      .in('status', ['paused', 'cancelled'])
      .eq('billing_exempt', false)
      .lte('degraded_at', daysAgoIso(GRACE_DAYS.sendingDomain))

    if (overdueDomainsError) throw overdueDomainsError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (overdueDomains ?? []) as any[]) {
      try {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, domain_status')
          .eq('id', row.tenant_id)
          .maybeSingle()

        if (tenantError) throw tenantError

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

        if (error) {
          logError('domain', row.tenant_id, error)
          continue
        }
        report.domainsReleased += 1
      } catch (err) {
        logError('domain', row.tenant_id, err)
      }
    }
  } catch (err) {
    logError('domain', null, err)
    report.steps.domain = 'failed'
  }

  // ── 3. Retencion: aviso a los 11 meses ──────────────────────────────────────
  try {
    const { data: oldCancelled, error: oldCancelledError } = await supabase
      .from('subscriptions')
      .select('tenant_id, degraded_at')
      .eq('status', 'cancelled')
      .eq('billing_exempt', false)
      .lte('degraded_at', daysAgoIso(330))

    if (oldCancelledError) throw oldCancelledError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (oldCancelled ?? []) as any[]) {
      try {
        // La condicion SQL de arriba (degraded_at <= hace 330 dias) sigue
        // siendo verdadera todos los dias entre el mes 11 y el mes 12: sin este
        // chequeo se reinsertaria el aviso en cada pasada diaria. Se ancla en
        // `type` — no en el texto del mensaje — para que "¿ya se avisó en este
        // ciclo?" siga siendo verdad aunque manana se retoque el copy (una
        // tilde, personalizacion por tenant...). Comparar el mensaje literal
        // habria reabierto la ventana de duplicados para todo aviso ya emitido
        // con el copy viejo.
        //
        // OJO: la ventana de busqueda arranca en el dia 330, NO en
        // `degraded_at`. La Task 16 inserta una notificacion del MISMO `type`
        // ('subscription_request') en el instante en que el tenant se degrada
        // — su `created_at` es esencialmente igual a `degraded_at`. Si se
        // buscara desde `degraded_at`, esa notificacion de degradacion
        // cumpliria la condicion SIEMPRE y el aviso de retencion no se
        // enviaria jamas, en silencio, para ningun tenant. Un aviso de
        // retencion previo solo puede existir dentro de esta ventana (a partir
        // del dia 330), asi que acotar la busqueda a ella basta para no
        // confundirlo con el de degradacion y sigue impidiendo el duplicado.
        const retentionWindowStart = new Date(
          new Date(row.degraded_at).getTime() + 330 * 86_400_000
        ).toISOString()

        const { data: existingWarning, error: existingError } = await supabase
          .from('notifications')
          .select('id')
          .eq('tenant_id', row.tenant_id)
          .eq('type', 'subscription_request')
          .gte('created_at', retentionWindowStart)
          .limit(1)

        if (existingError) throw existingError
        if (existingWarning && existingWarning.length > 0) continue

        const { error } = await supabase.from('notifications').insert({
          tenant_id: row.tenant_id,
          type:      'subscription_request',
          message:   RETENTION_WARNING_MESSAGE,
          read:      false,
          agent_id:  null,
        })

        if (error) {
          logError('retention', row.tenant_id, error)
          continue
        }
        report.retentionWarnings += 1
      } catch (err) {
        logError('retention', row.tenant_id, err)
      }
    }
  } catch (err) {
    logError('retention', null, err)
    report.steps.retention = 'failed'
  }

  return NextResponse.json({ ok: true, ...report })
}
