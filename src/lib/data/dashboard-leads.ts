import { createAdminClient } from '@/lib/supabase/admin'
import { applyVisibilityScope, type VisibilityScope } from '@/lib/auth/visibility'
import { columns } from '@/lib/supabase/columns'
import type { Urgency } from '@/lib/scoring/priority'

// Lecturas del dashboard sobre leads: histograma de score y los dos Top 5.

export interface TopLead {
  id: string
  firstName: string
  lastName: string
  agentId: string | null
  channelName: string | null
  score: number | null
  createdAt: string
  urgency: Urgency | null
}

const HISTOGRAM_BUCKETS = 10
const TOP_LIMIT = 5
// Leads en juego: activos o en proceso. Cerrados y perdidos quedan fuera.
const TOP_STAGES = ['nuevo', 'nutricion', 'en_proceso']

const emptyHistogram = () => Array<number>(HISTOGRAM_BUCKETS).fill(0)

/** Leads activos por tramo de score (10 tramos; 100 cae en el último). */
export async function getScoreHistogram(scope: VisibilityScope): Promise<number[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('lead_score_histogram', {
    p_tenant_id: scope.tenantId,
    p_agent_id:  scope.agentId,
  })
  if (error) {
    console.error('[lead_score_histogram]', error.message)
    return emptyHistogram()
  }
  if (!Array.isArray(data) || data.length !== HISTOGRAM_BUCKETS) return emptyHistogram()
  return (data as unknown[]).map(v => Number(v) || 0)
}

const TOP_COLUMNS = columns('leads_list', [
  'id', 'first_name', 'last_name', 'agent_id', 'current_score', 'created_at', 'urgency',
]) + ', acquisition_channels!acquisition_channel_id(name)'

function topQuery(scope: VisibilityScope) {
  const supabase = createAdminClient()
  return applyVisibilityScope(supabase.from('leads_list').select(TOP_COLUMNS), scope)
    .in('stage', TOP_STAGES)
    .eq('is_imported', false)
    .eq('is_subscriber', false)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTopLead(r: any): TopLead {
  return {
    id:          r.id as string,
    firstName:   r.first_name as string,
    lastName:    r.last_name as string,
    agentId:     (r.agent_id ?? null) as string | null,
    channelName: (r.acquisition_channels?.name ?? null) as string | null,
    score:       (r.current_score ?? null) as number | null,
    createdAt:   r.created_at as string,
    urgency:     (r.urgency ?? null) as Urgency | null,
  }
}

/** Top 5 por score y los 5 más recientes, en paralelo. */
export async function getTopLeads(scope: VisibilityScope): Promise<{ hot: TopLead[]; recent: TopLead[] }> {
  const [hot, recent] = await Promise.all([
    topQuery(scope)
      .order('current_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(TOP_LIMIT),
    topQuery(scope)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(TOP_LIMIT),
  ])
  if (hot.error) console.error('[top_leads_hot]', hot.error.message)
  if (recent.error) console.error('[top_leads_recent]', recent.error.message)
  return {
    hot:    ((hot.data ?? []) as unknown[]).map(toTopLead),
    recent: ((recent.data ?? []) as unknown[]).map(toTopLead),
  }
}
