import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Cierra el loop del análisis de fit con IA: mide si SEGUIR la recomendación
// correlaciona con que el lead avance en el embudo. Sin ML — correlación directa
// sobre el log ai_briefings (069) más el estado actual del lead.
//
// "Siguió" = el agente registró una acción sobre el lead dentro de la ventana de
// la premura del briefing (una acción manual, un correo one-off, una llamada o
// consulta). "Avanzó" = el estado actual del lead está más adelante en el embudo
// que el estado que tenía cuando se hizo el briefing.

export interface BriefingOutcomes {
  windowDays:          number
  total:               number
  followed:            number
  notFollowed:         number
  advancedFollowed:    number
  advancedNotFollowed: number
  // % de leads que avanzaron, entre los que siguieron / no siguieron (null si no hay muestra).
  rateFollowed:        number | null
  rateNotFollowed:     number | null
  // Diferencia (puntos porcentuales) — el "lift" de seguir la recomendación.
  lift:                number | null
  followRate:          number | null // % de briefings donde el agente actuó
}

// Eventos que representan una ACCIÓN del agente sobre el lead (no automáticos).
const FOLLOW_EVENT_TYPES = ['manual_email_sent', 'score_manual', 'phone_call', 'consultation_scheduled', 'consultation_attended']

// Rango del estado en el embudo (mayor = más avanzado). 'lost' es terminal negativo.
const STATUS_RANK: Record<string, number> = {
  new: 0, nurturing: 1, warm: 2, hot: 3,
  process_started: 4, process_completed: 5, closed: 6, lost: -1,
}

// Días de ventana para considerar "siguió" según la premura del briefing.
function windowDaysFor(when: string | null): number {
  if (when === 'hoy') return 2
  if (when === 'sin_apuro') return 21
  return 8 // esta_semana / desconocido
}

const empty = (windowDays: number): BriefingOutcomes => ({
  windowDays, total: 0, followed: 0, notFollowed: 0,
  advancedFollowed: 0, advancedNotFollowed: 0,
  rateFollowed: null, rateNotFollowed: null, lift: null, followRate: null,
})

export async function getBriefingOutcomes(
  tenantId: string | null,
  days = 90,
): Promise<BriefingOutcomes> {
  const db = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  try {
    let bq = db
      .from('ai_briefings')
      .select('lead_id, next_action_when, status_at, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(2000)
    if (tenantId) bq = bq.eq('tenant_id', tenantId)
    const { data: briefingsRaw, error } = await bq
    if (error) {
      // Tabla ausente (migración sin aplicar) u otro fallo → panel vacío, sin romper.
      console.error(JSON.stringify({ service: 'briefing-outcomes', error: error.message }))
      return empty(days)
    }
    const briefings = (briefingsRaw ?? []) as { lead_id: string; next_action_when: string | null; status_at: string | null; created_at: string }[]
    if (briefings.length === 0) return empty(days)

    const leadIds = [...new Set(briefings.map(b => b.lead_id))]
    const earliest = briefings[0].created_at

    const [{ data: leadsRaw }, { data: eventsRaw }] = await Promise.all([
      db.from('leads').select('id, status').in('id', leadIds),
      db.from('lead_events').select('lead_id, created_at')
        .in('lead_id', leadIds).in('type', FOLLOW_EVENT_TYPES).gte('created_at', earliest),
    ])

    const statusNow = new Map<string, string>()
    for (const l of (leadsRaw ?? []) as { id: string; status: string }[]) statusNow.set(l.id, l.status)

    // Tiempos de acción del agente por lead (ordenados ascendente por lead).
    const actionsByLead = new Map<string, number[]>()
    for (const e of (eventsRaw ?? []) as { lead_id: string; created_at: string }[]) {
      const arr = actionsByLead.get(e.lead_id) ?? []
      arr.push(new Date(e.created_at).getTime())
      actionsByLead.set(e.lead_id, arr)
    }

    const out = empty(days)
    out.total = briefings.length
    for (const b of briefings) {
      const start = new Date(b.created_at).getTime()
      const end   = start + windowDaysFor(b.next_action_when) * 24 * 3600 * 1000
      const acts  = actionsByLead.get(b.lead_id) ?? []
      const followed = acts.some(t => t > start && t <= end)

      const curr = statusNow.get(b.lead_id) ?? null
      const advanced = !!b.status_at && !!curr && curr !== 'lost' &&
        (STATUS_RANK[curr] ?? 0) > (STATUS_RANK[b.status_at] ?? 0)

      if (followed) { out.followed++; if (advanced) out.advancedFollowed++ }
      else          { out.notFollowed++; if (advanced) out.advancedNotFollowed++ }
    }

    out.rateFollowed    = out.followed    > 0 ? Math.round((out.advancedFollowed    / out.followed)    * 100) : null
    out.rateNotFollowed = out.notFollowed > 0 ? Math.round((out.advancedNotFollowed / out.notFollowed) * 100) : null
    out.lift            = out.rateFollowed !== null && out.rateNotFollowed !== null ? out.rateFollowed - out.rateNotFollowed : null
    out.followRate      = out.total > 0 ? Math.round((out.followed / out.total) * 100) : null
    return out
  } catch (e) {
    console.error(JSON.stringify({ service: 'briefing-outcomes', error: e instanceof Error ? e.message : 'unknown' }))
    return empty(days)
  }
}
