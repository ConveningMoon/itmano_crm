import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Agregaciones de uso de IA para los dashboards:
//   - Configuración → "Uso de IA" (scoped a un tenant)
//   - Centro de control (tenantId = null → global, con desglose por tenant)
//
// Cómputo en memoria: el volumen es de decenas-cientos de requests/mes.
// TODO: migrar a una RPC agregada si ai_usage_events supera ~10k filas.

export interface AiUsageTotals {
  requests:     number
  inputTokens:  number
  outputTokens: number
  costUsd:      number
}

export interface AiUsageByFeature extends AiUsageTotals {
  feature: string
}

export interface AiUsageByTenant extends AiUsageTotals {
  tenantId:   string | null
  tenantName: string
}

export interface AiUsageRequestRow {
  id:           string
  feature:      string
  model:        string
  inputTokens:  number
  outputTokens: number
  costUsd:      number
  createdAt:    string
  tenantName:   string | null
}

export interface AiUsageSummary {
  allTime:   AiUsageTotals
  last30d:   AiUsageTotals
  byFeature: AiUsageByFeature[]
  // Solo poblado en la vista global (tenantId = null).
  byTenant:  AiUsageByTenant[] | null
  recent:    AiUsageRequestRow[]
}

interface EventRow {
  id:            string
  tenant_id:     string | null
  feature:       string
  model:         string
  input_tokens:  number
  output_tokens: number
  cost_usd:      number | string
  created_at:    string
}

const emptyTotals = (): AiUsageTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })

function accumulate(t: AiUsageTotals, r: EventRow) {
  t.requests     += 1
  t.inputTokens  += r.input_tokens
  t.outputTokens += r.output_tokens
  t.costUsd      += Number(r.cost_usd)
}

/**
 * Uso de IA agregado. tenantId = null → vista global (super_admin) con
 * desglose por tenant; tenantId concreto → solo ese tenant.
 */
export async function getAiUsageSummary(tenantId: string | null): Promise<AiUsageSummary> {
  const supabase = createAdminClient()

  let q = supabase
    .from('ai_usage_events')
    .select('id, tenant_id, feature, model, input_tokens, output_tokens, cost_usd, created_at')
    .order('created_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data } = await q
  const rows = (data ?? []) as EventRow[]

  // Nombres de tenant para la vista global (y para la columna de recientes).
  const tenantName = new Map<string, string>()
  if (!tenantId) {
    const { data: tenants } = await supabase.from('tenants').select('id, name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (tenants ?? []) as any[]) tenantName.set(t.id as string, t.name as string)
  }

  const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const allTime = emptyTotals()
  const last30d = emptyTotals()
  const byFeatureMap = new Map<string, AiUsageTotals>()
  const byTenantMap  = new Map<string, AiUsageTotals>()

  for (const r of rows) {
    accumulate(allTime, r)
    if (r.created_at >= cutoff30d) accumulate(last30d, r)

    if (!byFeatureMap.has(r.feature)) byFeatureMap.set(r.feature, emptyTotals())
    accumulate(byFeatureMap.get(r.feature)!, r)

    if (!tenantId) {
      const key = r.tenant_id ?? '__none__'
      if (!byTenantMap.has(key)) byTenantMap.set(key, emptyTotals())
      accumulate(byTenantMap.get(key)!, r)
    }
  }

  const byFeature: AiUsageByFeature[] = [...byFeatureMap.entries()]
    .map(([feature, t]) => ({ feature, ...t }))
    .sort((a, b) => b.costUsd - a.costUsd)

  const byTenant: AiUsageByTenant[] | null = tenantId
    ? null
    : [...byTenantMap.entries()]
        .map(([key, t]) => ({
          tenantId:   key === '__none__' ? null : key,
          tenantName: key === '__none__' ? 'ITMANO (sin tenant)' : (tenantName.get(key) ?? key),
          ...t,
        }))
        .sort((a, b) => b.costUsd - a.costUsd)

  const recent: AiUsageRequestRow[] = rows.slice(0, 25).map(r => ({
    id:           r.id,
    feature:      r.feature,
    model:        r.model,
    inputTokens:  r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd:      Number(r.cost_usd),
    createdAt:    r.created_at,
    tenantName:   tenantId ? null : (r.tenant_id ? (tenantName.get(r.tenant_id) ?? r.tenant_id) : 'ITMANO'),
  }))

  return { allTime, last30d, byFeature, byTenant, recent }
}
