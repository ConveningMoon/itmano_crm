import { createAdminClient } from '@/lib/supabase/admin'
import type { VisibilityScope } from '@/lib/auth/visibility'
import type { PeriodDays } from '@/lib/dashboard/period'

// Métricas de email del dashboard en un solo viaje (RPC email_dashboard_stats).
// El scope viaja en la llamada: con agentId sólo cuentan envíos de sus leads.

export interface EmailSequenceStats {
  totalSends: number
  clickRate: number
  replyRate: number
  bounceRate: number
  unsubscribeRate: number
}

export interface EmailDashboardStats {
  totalSends: number
  uniqueLeads: number
  clickRate: number
  replyRate: number
  bounceRate: number
  unsubscribeRate: number
  byClass: { secuencias: number; grupales: number; etiqueta: number; cierre: number; otros: number }
  series: { start: string; sends: number }[]
  bySequence: Record<string, EmailSequenceStats>
}

function emptyEmailDashboardStats(): EmailDashboardStats {
  return {
    totalSends: 0, uniqueLeads: 0,
    clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0,
    byClass: { secuencias: 0, grupales: 0, etiqueta: 0, cierre: 0, otros: 0 },
    series: [], bySequence: {},
  }
}

export async function getEmailDashboardStats(
  scope: VisibilityScope,
  period: PeriodDays,
  timeZone: string,
): Promise<EmailDashboardStats> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('email_dashboard_stats', {
    p_tenant_id: scope.tenantId,
    p_agent_id:  scope.agentId,
    p_days:      period,
    p_time_zone: timeZone,
  })
  if (error) {
    // Sin este log, un fallo (p. ej. zona horaria inválida) se ve igual que un tenant sin envíos.
    console.error('[email_dashboard_stats]', error.message)
    return emptyEmailDashboardStats()
  }
  if (!data) return emptyEmailDashboardStats()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any
  const bySequence: Record<string, EmailSequenceStats> = {}
  for (const [id, s] of Object.entries((raw.by_sequence ?? {}) as Record<string, any>)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    bySequence[id] = {
      totalSends:      s.total_sends ?? 0,
      clickRate:       s.click_rate ?? 0,
      replyRate:       s.reply_rate ?? 0,
      bounceRate:      s.bounce_rate ?? 0,
      unsubscribeRate: s.unsubscribe_rate ?? 0,
    }
  }
  const c = raw.by_class ?? {}
  return {
    totalSends:      raw.total_sends ?? 0,
    uniqueLeads:     raw.unique_leads ?? 0,
    clickRate:       raw.click_rate ?? 0,
    replyRate:       raw.reply_rate ?? 0,
    bounceRate:      raw.bounce_rate ?? 0,
    unsubscribeRate: raw.unsubscribe_rate ?? 0,
    byClass: {
      secuencias: c.secuencias ?? 0,
      grupales:   c.grupales ?? 0,
      etiqueta:   c.etiqueta ?? 0,
      cierre:     c.cierre ?? 0,
      otros:      c.otros ?? 0,
    },
    series: ((raw.series ?? []) as { start: string; sends: number }[]).map(b => ({ start: b.start, sends: b.sends ?? 0 })),
    bySequence,
  }
}
