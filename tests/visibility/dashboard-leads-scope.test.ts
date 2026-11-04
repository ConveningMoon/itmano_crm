import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { VisibilityScope } from '@/lib/auth/visibility'

// Lecturas del dashboard sobre leads: el scope viaja en la llamada (RPC) o en la
// query (Top 5), y el mapeo de la respuesta no pierde ni inventa datos.

interface Call { method: string; args: unknown[] }
interface RecordedQuery { table: string; calls: Call[] }
interface RpcCall { fn: string; args: Record<string, unknown> }

let queries: RecordedQuery[] = []
let rpcCalls: RpcCall[] = []
let mockRows: unknown[] = []
let rpcData: unknown = null
let rpcError: unknown = null

function fakeQuery(record: RecordedQuery): unknown {
  const q: unknown = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: mockRows, error: null })
      return (...args: unknown[]) => { record.calls.push({ method: prop, args }); return q }
    },
  })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const record: RecordedQuery = { table, calls: [] }
      queries.push(record)
      return fakeQuery(record)
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: rpcData, error: rpcError })
    },
  }),
}))

const { getTopLeads, getScoreHistogram } = await import('@/lib/data/dashboard-leads')
const { getNewsletterGrowth } = await import('@/lib/data/newsletter-stats')
const { getChannelLeadsTrend } = await import('@/lib/data/channels')

const SUPER: VisibilityScope = { tenantId: null,        agentId: null }
const OWNER: VisibilityScope = { tenantId: 'tenant-aj', agentId: null }
const AGENT: VisibilityScope = { tenantId: 'tenant-aj', agentId: 'agent-dylan' }

beforeEach(() => {
  queries = []; rpcCalls = []; mockRows = []; rpcData = null; rpcError = null
})

const calls = (q: RecordedQuery, m: string) => q.calls.filter(c => c.method === m)

describe('getTopLeads', () => {
  it('rol agent: acota por tenant y agente en las dos consultas', async () => {
    await getTopLeads(AGENT)
    expect(queries).toHaveLength(2)
    for (const q of queries) {
      expect(q.table).toBe('leads_list')
      expect(calls(q, 'eq')).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-aj'] })
      expect(calls(q, 'eq')).toContainEqual({ method: 'eq', args: ['agent_id', 'agent-dylan'] })
    }
  })

  it('agent_owner no filtra por agente; super_admin no filtra por tenant', async () => {
    await getTopLeads(OWNER)
    for (const q of queries) expect(calls(q, 'eq').some(c => c.args[0] === 'agent_id')).toBe(false)
    queries = []
    await getTopLeads(SUPER)
    for (const q of queries) expect(calls(q, 'eq').some(c => c.args[0] === 'tenant_id')).toBe(false)
  })

  it('excluye importados, suscriptores, cerrados y perdidos, y limita a 5', async () => {
    await getTopLeads(OWNER)
    for (const q of queries) {
      expect(calls(q, 'in')[0].args).toEqual(['stage', ['nuevo', 'nutricion', 'en_proceso']])
      expect(calls(q, 'eq')).toContainEqual({ method: 'eq', args: ['is_imported', false] })
      expect(calls(q, 'eq')).toContainEqual({ method: 'eq', args: ['is_subscriber', false] })
      expect(calls(q, 'limit')[0].args).toEqual([5])
    }
  })

  it('pide el nombre del agente en la misma consulta, sin leer la tabla de agentes', async () => {
    await getTopLeads(OWNER)
    expect(queries.every(q => q.table === 'leads_list')).toBe(true)
    for (const q of queries) expect(String(calls(q, 'select')[0].args[0])).toContain('agents!agent_id(name)')
  })

  it('ordena hot por score y recent por fecha, con id como desempate', async () => {
    await getTopLeads(OWNER)
    const [hot, recent] = queries
    expect(calls(hot, 'order').map(c => c.args)).toEqual([
      ['current_score', { ascending: false, nullsFirst: false }],
      ['id', { ascending: false }],
    ])
    expect(calls(recent, 'order').map(c => c.args)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('mapea las filas', async () => {
    mockRows = [{
      id: 'l1', first_name: 'Ana', last_name: 'Paz', agent_id: 'a1', current_score: 80,
      created_at: '2026-11-01T00:00:00Z', urgency: 'hoy', acquisition_channels: { name: 'Web' }, agents: { name: 'Marta Ruiz' },
    }, {
      id: 'l2', first_name: 'Bo', last_name: 'Li', agent_id: null, current_score: null,
      created_at: '2026-11-02T00:00:00Z', urgency: null, acquisition_channels: null, agents: null,
    }]
    const r = await getTopLeads(OWNER)
    expect(r.hot[0]).toEqual({
      id: 'l1', firstName: 'Ana', lastName: 'Paz', agentId: 'a1', agentName: 'Marta Ruiz', channelName: 'Web',
      score: 80, createdAt: '2026-11-01T00:00:00Z', urgency: 'hoy',
    })
    expect(r.hot[1]).toMatchObject({ agentId: null, agentName: null, channelName: null, score: null, urgency: null })
  })
})

describe('getScoreHistogram', () => {
  it('envía el scope y devuelve 10 tramos', async () => {
    rpcData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(await getScoreHistogram(AGENT)).toEqual(rpcData)
    expect(rpcCalls[0]).toEqual({ fn: 'lead_score_histogram', args: { p_tenant_id: 'tenant-aj', p_agent_id: 'agent-dylan' } })
  })
  it('un error devuelve diez ceros y lo registra', async () => {
    rpcError = { message: 'boom' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getScoreHistogram(OWNER)).toEqual(Array(10).fill(0))
    expect(log).toHaveBeenCalledWith('[lead_score_histogram]', 'boom')
    log.mockRestore()
  })
})

describe('getNewsletterGrowth', () => {
  it('mapea la respuesta', async () => {
    rpcData = { active_now: 3, net_reliable: false, monthly: [{ month: '2026-11', signups: 2, unsubscribes: 1, active_end: 3 }] }
    expect(await getNewsletterGrowth('tenant-aj', 7)).toEqual({
      activeNow: 3, netReliable: false,
      monthly: [{ month: '2026-11', signups: 2, unsubscribes: 1, activeEnd: 3 }],
    })
    expect(rpcCalls[0]).toEqual({ fn: 'newsletter_growth', args: { p_tenant_id: 'tenant-aj', p_months: 7 } })
  })
  it('un error devuelve la forma vacía', async () => {
    rpcError = { message: 'boom' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getNewsletterGrowth('tenant-aj')).toEqual({ activeNow: 0, netReliable: true, monthly: [] })
    expect(log).toHaveBeenCalledWith('[newsletter_growth]', 'boom')
    log.mockRestore()
  })
})

describe('getChannelLeadsTrend', () => {
  it('envía tenant, periodo y zona', async () => {
    rpcData = { c1: [0, 1] }
    expect(await getChannelLeadsTrend('tenant-aj', 28, 'UTC')).toEqual({ c1: [0, 1] })
    expect(rpcCalls[0]).toEqual({ fn: 'channel_leads_trend', args: { p_tenant_id: 'tenant-aj', p_days: 28, p_time_zone: 'UTC' } })
  })
  it('un error devuelve objeto vacío', async () => {
    rpcError = { message: 'boom' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await getChannelLeadsTrend('tenant-aj', 7, 'UTC')).toEqual({})
    expect(log).toHaveBeenCalledWith('[channel_leads_trend]', 'boom')
    log.mockRestore()
  })
})
