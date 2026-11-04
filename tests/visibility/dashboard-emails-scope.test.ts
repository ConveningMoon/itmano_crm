import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { VisibilityScope } from '@/lib/auth/visibility'

// El dashboard lee las métricas de email con el RPC email_dashboard_stats. Fija
// que el scope viaja EN LA LLAMADA (tenant y agente), que el periodo es p_days y
// que el mapeo de la respuesta no pierde ni inventa conteos.

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

const { getEmailDashboardStats } = await import('@/lib/data/dashboard-emails')

const SUPER: VisibilityScope = { tenantId: null,        agentId: null }
const OWNER: VisibilityScope = { tenantId: 'tenant-aj', agentId: null }
const AGENT: VisibilityScope = { tenantId: 'tenant-aj', agentId: 'agent-dylan' }

beforeEach(() => {
  calls = []
  mockData = null
  mockError = null
})

describe('getEmailDashboardStats — scope y periodo', () => {
  it('agent_owner: acota por tenant y no por agente', async () => {
    await getEmailDashboardStats(OWNER, 28, 'America/New_York')
    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('email_dashboard_stats')
    expect(calls[0].args).toEqual({
      p_tenant_id: 'tenant-aj', p_agent_id: null, p_days: 28, p_time_zone: 'America/New_York',
    })
  })

  it("rol 'agent': acota por tenant Y por agente", async () => {
    await getEmailDashboardStats(AGENT, 7, 'UTC')
    expect(calls[0].args.p_tenant_id).toBe('tenant-aj')
    expect(calls[0].args.p_agent_id).toBe('agent-dylan')
    expect(calls[0].args.p_days).toBe(7)
  })

  it('super_admin: sin filtro de tenant ni de agente', async () => {
    await getEmailDashboardStats(SUPER, 91, 'UTC')
    expect(calls[0].args.p_tenant_id).toBeNull()
    expect(calls[0].args.p_agent_id).toBeNull()
    expect(calls[0].args.p_days).toBe(91)
  })
})

describe('getEmailDashboardStats — mapeo', () => {
  it('traduce el jsonb sin perder conteos', async () => {
    mockData = {
      total_sends: 9, unique_leads: 3,
      click_rate: 33, reply_rate: 67, bounce_rate: 0, unsubscribe_rate: 33,
      by_class: { secuencias: 3, grupales: 2, etiqueta: 1, cierre: 1, otros: 2 },
      series: [{ start: '2026-11-03', sends: 4 }, { start: '2026-11-04', sends: 5 }],
      by_sequence: {
        'seq-1': { total_sends: 3, click_rate: 50, reply_rate: 10, bounce_rate: 1, unsubscribe_rate: 2 },
      },
    }
    expect(await getEmailDashboardStats(OWNER, 7, 'UTC')).toEqual({
      totalSends: 9, uniqueLeads: 3,
      clickRate: 33, replyRate: 67, bounceRate: 0, unsubscribeRate: 33,
      byClass: { secuencias: 3, grupales: 2, etiqueta: 1, cierre: 1, otros: 2 },
      series: [{ start: '2026-11-03', sends: 4 }, { start: '2026-11-04', sends: 5 }],
      bySequence: { 'seq-1': { totalSends: 3, clickRate: 50, replyRate: 10, bounceRate: 1, unsubscribeRate: 2 } },
    })
  })

  it('un error del RPC devuelve la forma vacía, no revienta la página', async () => {
    mockError = { message: 'boom' }
    expect(await getEmailDashboardStats(OWNER, 7, 'UTC')).toEqual({
      totalSends: 0, uniqueLeads: 0,
      clickRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0,
      byClass: { secuencias: 0, grupales: 0, etiqueta: 0, cierre: 0, otros: 0 },
      series: [], bySequence: {},
    })
  })

  it('una respuesta vacía también devuelve la forma vacía', async () => {
    mockData = null
    const s = await getEmailDashboardStats(OWNER, 7, 'UTC')
    expect(s.totalSends).toBe(0)
    expect(s.series).toEqual([])
  })
})
