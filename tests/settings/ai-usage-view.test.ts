import { describe, expect, it } from 'vitest'
import { aiUsageByMonth, limitGauge, maskAiCosts } from '@/lib/ai-usage/view'
import type { AgentAiBreakdown, AiUsageSummary } from '@/lib/data/ai-usage'

const NOW = new Date('2026-11-15T10:00:00.000Z')

describe('aiUsageByMonth', () => {
  it('devuelve 6 meses continuos con ceros', () => {
    const out = aiUsageByMonth([], NOW)
    expect(out.map(m => m.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(out.every(m => m.requests === 0 && m.costUsd === 0 && m.label.length > 0)).toBe(true)
  })

  it('cruza bien de diciembre a enero', () => {
    const out = aiUsageByMonth([], new Date('2027-02-03T00:00:00.000Z'))
    expect(out.map(m => m.key)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'])
  })

  it('cuenta el último instante del mes en ese mes, en UTC', () => {
    const out = aiUsageByMonth([
      { created_at: '2026-10-31T23:59:59.999Z', cost_usd: 1 },
      { created_at: '2026-11-01T00:00:00.000Z', cost_usd: 2 },
    ], NOW)
    const oct = out.find(m => m.key === '2026-10')!
    const nov = out.find(m => m.key === '2026-11')!
    expect([oct.requests, oct.costUsd]).toEqual([1, 1])
    expect([nov.requests, nov.costUsd]).toEqual([1, 2])
  })

  it('ignora eventos fuera de la ventana', () => {
    const out = aiUsageByMonth([
      { created_at: '2026-05-31T23:59:59.999Z', cost_usd: 5 },
      { created_at: '2026-12-01T00:00:00.000Z', cost_usd: 7 },
    ], NOW)
    expect(out.reduce((s, m) => s + m.requests, 0)).toBe(0)
  })

  it('acepta cost_usd como string y redondea a 2 decimales al final', () => {
    const out = aiUsageByMonth([
      { created_at: '2026-11-02T00:00:00Z', cost_usd: '0.004' },
      { created_at: '2026-11-03T00:00:00Z', cost_usd: '0.004' },
      { created_at: '2026-11-04T00:00:00Z', cost_usd: 0.003 },
    ], NOW)
    expect(out[5].requests).toBe(3)
    expect(out[5].costUsd).toBe(0.01)
  })
})

const totals = (costUsd: number) => ({ requests: 2, inputTokens: 10, outputTokens: 20, costUsd })

function summary(): AiUsageSummary {
  return {
    allTime: totals(5), last30d: totals(3),
    byFeature: [{ feature: 'x', ...totals(2) }],
    byTenant: [{ tenantId: 't', tenantName: 'T', ...totals(4) }],
    recent: [{ id: '1', feature: 'x', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.5, createdAt: '2026-11-01T00:00:00Z', tenantName: null }],
    byMonth: [{ key: '2026-11', label: 'nov', requests: 2, costUsd: 3 }],
  }
}

const breakdown = (): AgentAiBreakdown => ({
  agents: [{
    agentId: 'a', agentName: 'A', agentColor: '#fff', hasLogin: true, requests: 1,
    inputTokens: 1, outputTokens: 1, costUsd: 1.5, shareRatio: null, ofTeamRatio: 1,
  }],
  splitApplies: false, agentCount: 1,
})

describe('maskAiCosts', () => {
  it('con showCosts false deja en 0 todos los costUsd, también byMonth y byAgent', () => {
    const { summary: s, byAgent } = maskAiCosts(summary(), breakdown(), false)
    expect([s.allTime.costUsd, s.last30d.costUsd]).toEqual([0, 0])
    expect(s.byFeature.map(f => f.costUsd)).toEqual([0])
    expect(s.recent.map(r => r.costUsd)).toEqual([0])
    expect(s.byMonth.map(m => m.costUsd)).toEqual([0])
    expect(byAgent?.agents.map(a => a.costUsd)).toEqual([0])
    // Lo que no es dinero se conserva.
    expect(s.allTime.requests).toBe(2)
    expect(s.byMonth[0].requests).toBe(2)
  })

  it('con showCosts false deja byTenant en null', () => {
    expect(maskAiCosts(summary(), null, false).summary.byTenant).toBeNull()
  })

  it('con showCosts false conserva un byAgent null', () => {
    expect(maskAiCosts(summary(), null, false).byAgent).toBeNull()
  })

  it('con showCosts true no cambia nada', () => {
    const s = summary()
    const b = breakdown()
    const out = maskAiCosts(s, b, true)
    expect(out.summary).toEqual(summary())
    expect(out.byAgent).toEqual(breakdown())
  })
})

describe('limitGauge', () => {
  it('null → hidden; unlimited → unlimited', () => {
    expect(limitGauge(null)).toEqual({ kind: 'hidden' })
    expect(limitGauge({ unlimited: true, usedRatio: 0, blocked: false })).toEqual({ kind: 'unlimited' })
  })

  it('0.38 → 38; 1.4 → 100; blocked se conserva', () => {
    expect(limitGauge({ unlimited: false, usedRatio: 0.38, blocked: false })).toEqual({ kind: 'gauge', percent: 38, blocked: false })
    expect(limitGauge({ unlimited: false, usedRatio: 1.4, blocked: true })).toEqual({ kind: 'gauge', percent: 100, blocked: true })
  })
})
