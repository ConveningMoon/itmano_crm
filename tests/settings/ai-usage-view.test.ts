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

  it('coloca cada mes agregado en su posición y deja ceros en los demás', () => {
    const out = aiUsageByMonth([
      { key: '2026-10', requests: 3, costUsd: 1 },
      { key: '2026-11', requests: 1, costUsd: 2 },
    ], NOW)
    const oct = out.find(m => m.key === '2026-10')!
    const nov = out.find(m => m.key === '2026-11')!
    expect([oct.requests, oct.costUsd]).toEqual([3, 1])
    expect([nov.requests, nov.costUsd]).toEqual([1, 2])
    expect(out.find(m => m.key === '2026-09')!.requests).toBe(0)
  })

  it('ignora meses fuera de la ventana', () => {
    const out = aiUsageByMonth([
      { key: '2026-05', requests: 5, costUsd: 5 },
      { key: '2026-12', requests: 7, costUsd: 7 },
    ], NOW)
    expect(out.reduce((s, m) => s + m.requests, 0)).toBe(0)
  })

  it('con now en día 31 no se salta ni repite meses', () => {
    expect(aiUsageByMonth([], new Date('2026-10-31T23:59:59Z')).map(m => m.key))
      .toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(aiUsageByMonth([], new Date('2026-03-31T12:00:00Z')).map(m => m.key))
      .toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'])
  })

  it('acepta el costo como string (numeric) y redondea a 6 decimales', () => {
    const out = aiUsageByMonth([
      { key: '2026-11', requests: 3, costUsd: '0.0110000001' },
    ], NOW)
    expect(out[5].requests).toBe(3)
    expect(out[5].costUsd).toBe(0.011)
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

  it('con showCosts false, ninguna clave costUsd anidada vale distinto de 0', () => {
    const out = maskAiCosts(summary(), breakdown(), false)
    const vistos: number[] = []
    const recorre = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(recorre)
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (k === 'costUsd') vistos.push(x as number)
          else recorre(x)
        }
      }
    }
    recorre(out)
    expect(vistos.length).toBeGreaterThan(5)
    expect(vistos.every(c => c === 0)).toBe(true)
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
    expect(limitGauge({ unlimited: false, usedRatio: 0.38, blocked: false })).toEqual({ kind: 'gauge', percent: 38, blocked: false, near: false })
    expect(limitGauge({ unlimited: false, usedRatio: 1.4, blocked: true })).toEqual({ kind: 'gauge', percent: 100, blocked: true, near: true })
    expect(limitGauge({ unlimited: false, usedRatio: 0.8, blocked: false })).toMatchObject({ percent: 80, near: true })
    expect(limitGauge({ unlimited: false, usedRatio: 0.79, blocked: false })).toMatchObject({ percent: 79, near: false })
  })
})
