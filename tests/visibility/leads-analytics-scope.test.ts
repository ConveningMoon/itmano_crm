import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { VisibilityScope } from '@/lib/auth/visibility'

// /analytics agrega en Postgres (RPC lead_analytics_stats). Estas pruebas fijan
// que el scope de visibilidad viaja EN LA LLAMADA — no como un filtro en JS sobre
// leads ya traídos, que es justo lo que esta refactorización eliminó — y que el
// mapeo de la respuesta no pierde ni inventa conteos.

interface RpcCall { fn: string; args: Record<string, unknown> }

let calls: RpcCall[] = []
let mockData: unknown = null
let mockError: unknown = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return Promise.resolve({ data: mockData, error: mockError })
    },
  }),
}))

const { getLeadAnalyticsStats, ANALYTICS_MONTHS } = await import('@/lib/data/leads')

const SUPER: VisibilityScope = { tenantId: null,        agentId: null }
const OWNER: VisibilityScope = { tenantId: 'tenant-aj', agentId: null }
const AGENT: VisibilityScope = { tenantId: 'tenant-aj', agentId: 'agent-dylan' }

beforeEach(() => {
  calls = []
  mockData = null
  mockError = null
})

describe('getLeadAnalyticsStats — scope de visibilidad', () => {
  it('agent_owner: acota por tenant y no por agente', async () => {
    await getLeadAnalyticsStats(OWNER)

    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('lead_analytics_stats')
    expect(calls[0].args.p_tenant_id).toBe('tenant-aj')
    expect(calls[0].args.p_agent_id).toBeNull()
  })

  it("rol 'agent': acota por tenant Y por agente", async () => {
    await getLeadAnalyticsStats(AGENT)

    expect(calls[0].args.p_tenant_id).toBe('tenant-aj')
    expect(calls[0].args.p_agent_id).toBe('agent-dylan')
  })

  it('super_admin: sin filtro de tenant', async () => {
    await getLeadAnalyticsStats(SUPER)

    expect(calls[0].args.p_tenant_id).toBeNull()
    expect(calls[0].args.p_agent_id).toBeNull()
  })

  it('la ventana mensual por defecto son los meses que pinta la gráfica', async () => {
    await getLeadAnalyticsStats(OWNER)
    expect(calls[0].args.p_months).toBe(ANALYTICS_MONTHS)

    await getLeadAnalyticsStats(OWNER, 12)
    expect(calls[1].args.p_months).toBe(12)
  })
})

describe('getLeadAnalyticsStats — mapeo de la respuesta', () => {
  it('traduce el jsonb del RPC a la forma que consume la página', async () => {
    mockData = {
      total: 120,
      hot: 14,
      closed: 9,
      live_avg_score: 41,
      this_month: { leads: 7, hot: 2 },
      by_source: [
        { channel_type: 'lead_magnet', traffic_source: null,        total: 60 },
        { channel_type: null,          traffic_source: 'instagram', total: 60 },
      ],
      by_agent: [
        { agent_id: 'agent-dylan', total: 100, hot: 12, closed: 8, avg_score: 44, statuses: { new: 90, hot: 10 } },
      ],
      monthly: [{ month: '2026-07', leads: 7, nurturing: 1, hot: 2, closed: 0 }],
    }

    const stats = await getLeadAnalyticsStats(OWNER)

    expect(stats.total).toBe(120)
    expect(stats.hot).toBe(14)
    expect(stats.closed).toBe(9)
    expect(stats.liveAvgScore).toBe(41)
    expect(stats.thisMonth).toEqual({ leads: 7, hot: 2 })
    expect(stats.bySource).toEqual([
      { channelType: 'lead_magnet', trafficSource: null,        total: 60 },
      { channelType: null,          trafficSource: 'instagram', total: 60 },
    ])
    expect(stats.byAgent[0]).toEqual({
      agentId: 'agent-dylan', total: 100, hot: 12, closed: 8, avgScore: 44,
      statuses: { new: 90, hot: 10 },
    })
    expect(stats.monthly).toEqual([{ month: '2026-07', leads: 7, nurturing: 1, hot: 2, closed: 0 }])
  })

  it('sin pipeline vivo la temperatura media queda en null (la página muestra “—”)', async () => {
    mockData = { total: 3, hot: 0, closed: 3, live_avg_score: null, this_month: { leads: 0, hot: 0 } }

    const stats = await getLeadAnalyticsStats(OWNER)

    expect(stats.liveAvgScore).toBeNull()
    expect(stats.bySource).toEqual([])
    expect(stats.byAgent).toEqual([])
    expect(stats.monthly).toEqual([])
  })

  it('un error del RPC devuelve ceros, no revienta la página', async () => {
    mockError = { message: 'boom' }

    const stats = await getLeadAnalyticsStats(OWNER)

    expect(stats).toEqual({
      total: 0, hot: 0, closed: 0, liveAvgScore: null,
      thisMonth: { leads: 0, hot: 0 },
      bySource: [], byAgent: [], monthly: [],
    })
  })
})
