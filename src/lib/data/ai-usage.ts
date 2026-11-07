import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { discretionaryLimitUsd } from '@/lib/services/ai-budget'
import { getSubscription } from '@/lib/data/subscriptions'
import { getTenantShellRow, getTenantNames } from '@/lib/data/tenants'
import { DEFAULT_TENANT_COLOR } from '@/lib/config'
import { aiUsageByMonth, type AiUsageMonthPoint } from '@/lib/ai-usage/view'
import { columns } from '@/lib/supabase/columns'

// Agregaciones de uso de IA para los dashboards:
//   - Configuración → "Uso de IA" (scoped a un tenant)
//   - Centro de control (tenantId = null → global, con desglose por tenant)
//
// Los totales salen de la RPC ai_usage_summary, que agrega en la base: leer las
// filas y sumarlas aquí se quedaba corto en cuanto hubiera más de 1000 eventos
// (el tope de filas de la Data API). Sólo los recientes se leen fila a fila.

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
  // Últimos 6 meses (UTC), con ceros.
  byMonth:   AiUsageMonthPoint[]
}

// Forma del jsonb de ai_usage_summary (supabase/migrations/20261107120000_ai_usage_summary.sql).
// Los numeric pueden llegar como número o string; se normalizan con Number().
type RawTotals = { requests: number; inputTokens: number; outputTokens: number; costUsd: number | string }
interface RawSummary {
  allTime:   RawTotals
  last30d:   RawTotals
  byFeature: (RawTotals & { feature: string })[]
  byTenant:  (RawTotals & { tenantId: string | null })[] | null
  byMonth:   { key: string; requests: number; costUsd: number | string }[]
}

const RECENT_COLUMNS = columns('ai_usage_events', [
  'id', 'tenant_id', 'feature', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'created_at',
])
const RECENT_LIMIT = 25

const emptyTotals = (): AiUsageTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000

function totals(t: RawTotals | null | undefined): AiUsageTotals {
  if (!t) return emptyTotals()
  return {
    requests:     Number(t.requests),
    inputTokens:  Number(t.inputTokens),
    outputTokens: Number(t.outputTokens),
    costUsd:      round6(Number(t.costUsd)),
  }
}

/**
 * Uso de IA agregado. tenantId = null → vista global (super_admin) con
 * desglose por tenant; tenantId concreto → solo ese tenant. `agentId` filtra
 * a los requests de UN agente (la vista personal de un rol 'agent').
 */
export async function getAiUsageSummary(
  tenantId: string | null,
  opts?: { agentId?: string },
): Promise<AiUsageSummary> {
  const supabase = createAdminClient()
  const agentId = opts?.agentId ?? null

  let recentQ = supabase
    .from('ai_usage_events')
    .select(RECENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT)
  if (tenantId) recentQ = recentQ.eq('tenant_id', tenantId)
  if (agentId) recentQ = recentQ.eq('agent_id', agentId)

  // Agregados, recientes y nombres de tenant (sólo la vista global) en paralelo.
  const [summaryRes, recentRes, tenantName] = await Promise.all([
    supabase.rpc('ai_usage_summary', { p_tenant_id: tenantId, p_agent_id: agentId, p_months: 6 }),
    recentQ,
    tenantId ? Promise.resolve(new Map<string, string>()) : getTenantNames(),
  ])
  if (summaryRes.error) console.error('[ai_usage_summary]', summaryRes.error.message)
  if (recentRes.error) console.error('[ai_usage_events recent]', recentRes.error.message)

  const raw = (summaryRes.data ?? null) as RawSummary | null

  const byFeature: AiUsageByFeature[] = (raw?.byFeature ?? []).map(f => ({ feature: f.feature, ...totals(f) }))

  const byTenant: AiUsageByTenant[] | null = tenantId
    ? null
    : (raw?.byTenant ?? []).map(t => ({
        tenantId:   t.tenantId,
        tenantName: t.tenantId ? (tenantName.get(t.tenantId) ?? t.tenantId) : 'ITMANO (sin tenant)',
        ...totals(t),
      }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent: AiUsageRequestRow[] = ((recentRes.data ?? []) as any[]).map(r => ({
    id:           r.id as string,
    feature:      r.feature as string,
    model:        r.model as string,
    inputTokens:  r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    costUsd:      Number(r.cost_usd),
    createdAt:    r.created_at as string,
    tenantName:   tenantId ? null : (r.tenant_id ? (tenantName.get(r.tenant_id as string) ?? (r.tenant_id as string)) : 'ITMANO'),
  }))

  return {
    allTime: totals(raw?.allTime),
    last30d: totals(raw?.last30d),
    byFeature,
    byTenant,
    recent,
    byMonth: aiUsageByMonth(raw?.byMonth ?? [], new Date()),
  }
}

// ── Desglose por agente (mes en curso) ────────────────────────────────────────
// Para el panel del owner en Configuración: cuánto consume cada agente. En plan
// Partner con límite finito, `shareRatio` es el % de SU parte igual del
// presupuesto (la palanca del reparto); si el tenant es ilimitado o no es
// Partner, shareRatio es null y la UI muestra su % del uso total del equipo.

export interface AiUsageByAgent {
  agentId:      string
  agentName:    string
  agentColor:   string
  hasLogin:     boolean
  requests:     number
  inputTokens:  number
  outputTokens: number
  costUsd:      number
  // % de su parte igual del límite (0–1), o null si el reparto no aplica.
  shareRatio:   number | null
  // % del uso total del equipo en el mes (0–1).
  ofTeamRatio:  number
}

export interface AgentAiBreakdown {
  agents:    AiUsageByAgent[]
  // true cuando shareRatio viene poblado (Partner con límite finito).
  splitApplies: boolean
  agentCount:   number
}

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function getAgentAiBreakdown(tenantId: string): Promise<AgentAiBreakdown> {
  const supabase = createAdminClient()

  // La fila del tenant y la suscripción salen de los getters cacheados que el
  // shell ya pidió en este mismo request: cero round-trips extra.
  const [{ data: agents }, { data: events }, tenant, sub] = await Promise.all([
    supabase.from('agents').select('id, name, accent_color, user_id').eq('tenant_id', tenantId).order('name'),
    supabase
      .from('ai_usage_events')
      .select('agent_id, cost_usd, input_tokens, output_tokens')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStartIso()),
    getTenantShellRow(tenantId),
    getSubscription(tenantId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRows = (agents ?? []) as any[]
  const unlimited = tenant?.ai_unlimited ?? false
  const isPartner = sub?.plan === 'partner'
  const limitUsd  = Number(tenant?.ai_monthly_limit_usd ?? 10)

  const splitApplies = isPartner && !unlimited && agentRows.length > 0 && limitUsd > 0
  // Lo mismo que reparte getAgentAiShare (ai-limit.ts): el tramo DISCRECIONAL,
  // no el tope. Este panel y el gate tienen que dar el mismo número — si el
  // Centro de control dice que a un agente le queda parte y la generación lo
  // rechaza, nadie sabe cuál de los dos miente.
  const shareUsd = splitApplies ? discretionaryLimitUsd('partner', limitUsd) / agentRows.length : 0

  interface Acc { requests: number; input: number; output: number; cost: number }
  const byAgent = new Map<string, Acc>()
  let teamCost = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) {
    const cost = Number(e.cost_usd)
    teamCost += cost
    const key = (e.agent_id as string | null) ?? '__none__'
    const acc = byAgent.get(key) ?? { requests: 0, input: 0, output: 0, cost: 0 }
    acc.requests += 1
    acc.input    += e.input_tokens as number
    acc.output   += e.output_tokens as number
    acc.cost     += cost
    byAgent.set(key, acc)
  }

  const result: AiUsageByAgent[] = agentRows.map(a => {
    const acc = byAgent.get(a.id as string) ?? { requests: 0, input: 0, output: 0, cost: 0 }
    return {
      agentId:      a.id as string,
      agentName:    a.name as string,
      agentColor:   (a.accent_color as string) ?? DEFAULT_TENANT_COLOR,
      hasLogin:     !!a.user_id,
      requests:     acc.requests,
      inputTokens:  acc.input,
      outputTokens: acc.output,
      costUsd:      Math.round(acc.cost * 1_000_000) / 1_000_000,
      shareRatio:   splitApplies ? Math.min(1, acc.cost / shareUsd) : null,
      ofTeamRatio:  teamCost > 0 ? acc.cost / teamCost : 0,
    }
  }).sort((a, b) => b.costUsd - a.costUsd)

  return { agents: result, splitApplies, agentCount: agentRows.length }
}

// ── Consumo del análisis de fit con IA (feature 'lead_fit') ───────────────────
// Un análisis por fila, con el lead y el costo — para que el super_admin sepa
// cuánto cuesta cada análisis por lead. tenantId = null → todos los tenants.

export interface LeadFitUsageRow {
  id:           string
  leadName:     string
  tenantName:   string | null
  model:        string
  inputTokens:  number
  outputTokens: number
  costUsd:      number
  createdAt:    string
}

export interface LeadFitUsageSummary {
  count:        number
  totalCostUsd: number
  avgCostUsd:   number
  last30dCount: number
  last30dCostUsd: number
  rows:         LeadFitUsageRow[]
}

export async function getLeadFitUsage(tenantId: string | null): Promise<LeadFitUsageSummary> {
  const supabase = createAdminClient()

  let q = supabase
    .from('ai_usage_events')
    .select('id, tenant_id, model, input_tokens, output_tokens, cost_usd, metadata, created_at')
    .eq('feature', 'lead_fit')
    .order('created_at', { ascending: false })
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const [{ data }, tenantName] = await Promise.all([
    q,
    tenantId ? Promise.resolve(new Map<string, string>()) : getTenantNames(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]

  const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  let totalCost = 0
  let count = 0
  let d30Count = 0
  let d30Cost = 0

  const out: LeadFitUsageRow[] = rows.map(r => {
    const cost = Number(r.cost_usd)
    totalCost += cost
    count += 1
    if ((r.created_at as string) >= cutoff30d) { d30Count += 1; d30Cost += cost }
    const leadName = (r.metadata?.lead_name as string | undefined)?.trim() || 'Lead'
    return {
      id:           r.id as string,
      leadName,
      tenantName:   tenantId ? null : (r.tenant_id ? (tenantName.get(r.tenant_id as string) ?? (r.tenant_id as string)) : 'ITMANO'),
      model:        r.model as string,
      inputTokens:  r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      costUsd:      cost,
      createdAt:    r.created_at as string,
    }
  }).slice(0, 200)

  return {
    count,
    totalCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
    avgCostUsd:   count > 0 ? Math.round((totalCost / count) * 1_000_000) / 1_000_000 : 0,
    last30dCount: d30Count,
    last30dCostUsd: Math.round(d30Cost * 1_000_000) / 1_000_000,
    rows: out,
  }
}

// ── Serie diaria (Centro de control) ──────────────────────────────────────────
// Costo por día de los últimos N días, apilado por tenant — el "diagrama" del
// hub reemplaza al listado plano de requests recientes.

export interface AiDailyPoint {
  // yyyy-mm-dd (UTC)
  date:     string
  requests: number
  costUsd:  number
  // nombre de tenant → costo USD del día (para apilar en el chart)
  byTenant: Record<string, number>
}

export interface AiDailySeries {
  days:        AiDailyPoint[]
  tenantNames: string[]
}

export async function getAiDailyUsage(days = 30): Promise<AiDailySeries> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
  const cutoffIso = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate())).toISOString()

  const [{ data: events }, tenantName] = await Promise.all([
    supabase
      .from('ai_usage_events')
      .select('tenant_id, cost_usd, created_at')
      .gte('created_at', cutoffIso)
      .order('created_at'),
    getTenantNames(),
  ])

  // Días continuos (con ceros) para que el eje no salte fechas sin uso.
  const byDay = new Map<string, AiDailyPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000)
    const key = d.toISOString().slice(0, 10)
    byDay.set(key, { date: key, requests: 0, costUsd: 0, byTenant: {} })
  }

  const names = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (events ?? []) as any[]) {
    const key = (e.created_at as string).slice(0, 10)
    const point = byDay.get(key)
    if (!point) continue
    const cost = Number(e.cost_usd)
    const name = e.tenant_id ? (tenantName.get(e.tenant_id as string) ?? (e.tenant_id as string)) : 'ITMANO'
    names.add(name)
    point.requests += 1
    point.costUsd  = Math.round((point.costUsd + cost) * 1_000_000) / 1_000_000
    point.byTenant[name] = Math.round(((point.byTenant[name] ?? 0) + cost) * 1_000_000) / 1_000_000
  }

  return { days: [...byDay.values()], tenantNames: [...names] }
}
