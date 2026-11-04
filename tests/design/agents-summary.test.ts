import { describe, expect, it } from 'vitest'
import { summarizeAgents } from '@/lib/dashboard/agents-summary'

const a = (id: string, total: number, highQuality = 0, closed = 0) => ({ id, total, highQuality, closed })

describe('summarizeAgents', () => {
  it('sin sobrante de agentes inactivos no agrega fila', () => {
    const r = summarizeAgents([a('1', 10, 2, 1), a('2', 5, 1, 0)], { total: 15, closed: 1, highQuality: 3 })
    expect(r.inactive).toBeNull()
    expect(r.total).toBe(15)
    expect(r.perAgent).toBe(8)
  })

  it('cuenta el sobrante de agentes inactivos con las cifras globales', () => {
    const r = summarizeAgents([a('1', 10, 2, 1)], { total: 14, closed: 4, highQuality: 5 })
    expect(r.inactive).toEqual({ total: 4, highQuality: 3, closed: 3 })
    expect(r.total).toBe(14)
    expect(r.closed).toBe(4)
    expect(r.highQuality).toBe(5)
    expect(r.perAgent).toBe(10)
  })

  it('sin agentes activos no divide entre cero', () => {
    const r = summarizeAgents([], { total: 3, closed: 0, highQuality: 0 })
    expect(r.perAgent).toBe(0)
    expect(r.inactive).toEqual({ total: 3, highQuality: 0, closed: 0 })
    expect(summarizeAgents([], { total: 0, closed: 0, highQuality: 0 }).inactive).toBeNull()
  })
})
