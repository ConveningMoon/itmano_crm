import { describe, it, expect } from 'vitest'
import { resolveRoutedAgent, type RoutingAgent } from '@/lib/services/route-channel-agent'

// A&J-like roster: Adriana (login), Dylan (login), John, Viviane, Melanie (first_buyer).
function roster(overrides: Partial<Record<string, Partial<RoutingAgent>>> = {}): RoutingAgent[] {
  const base: Record<string, RoutingAgent> = {
    'agent-adriana': { id: 'agent-adriana', active: true, specialty: 'hispanic',   lastRoutedAt: null },
    'agent-dylan':   { id: 'agent-dylan',   active: true, specialty: 'hispanic',   lastRoutedAt: null },
    'agent-john':    { id: 'agent-john',    active: true, specialty: 'military',    lastRoutedAt: null },
    'agent-viviane': { id: 'agent-viviane', active: true, specialty: 'brazilian',   lastRoutedAt: null },
    'agent-melanie': { id: 'agent-melanie', active: true, specialty: 'first_buyer', lastRoutedAt: null },
  }
  for (const [id, o] of Object.entries(overrides)) base[id] = { ...base[id], ...o }
  return Object.values(base)
}

describe('resolveRoutedAgent — explicit channel agent', () => {
  it('returns the linked agent when it is active', () => {
    expect(resolveRoutedAgent('agent-john', roster())).toBe('agent-john')
  })

  it('even a first_buyer agent can be explicitly linked (manual exclusion is round-robin only)', () => {
    expect(resolveRoutedAgent('agent-melanie', roster())).toBe('agent-melanie')
  })

  it('falls back to round-robin when the linked agent is inactive', () => {
    const agents = roster({ 'agent-john': { active: false } })
    const chosen = resolveRoutedAgent('agent-john', agents)
    expect(chosen).not.toBe('agent-john')
    expect(chosen).not.toBeNull()
  })

  it('falls back to round-robin when the linked agent id is unknown', () => {
    expect(resolveRoutedAgent('agent-ghost', roster())).not.toBeNull()
  })
})

describe('resolveRoutedAgent — round-robin ("Toda la agencia")', () => {
  it('excludes the first_buyer specialty (Melanie)', () => {
    // All others have a recent assignment; only Melanie is "free" — she must NOT be picked.
    const t = '2026-06-01T00:00:00Z'
    const agents = roster({
      'agent-adriana': { lastRoutedAt: t },
      'agent-dylan':   { lastRoutedAt: t },
      'agent-john':    { lastRoutedAt: t },
      'agent-viviane': { lastRoutedAt: t },
    })
    expect(resolveRoutedAgent(null, agents)).not.toBe('agent-melanie')
  })

  it('never-routed agents go first; ties broken by id', () => {
    // All eligible never routed → lowest id wins (agent-adriana).
    expect(resolveRoutedAgent(null, roster())).toBe('agent-adriana')
  })

  it('picks the agent whose last assignment is oldest', () => {
    const agents = roster({
      'agent-adriana': { lastRoutedAt: '2026-06-10T00:00:00Z' },
      'agent-dylan':   { lastRoutedAt: '2026-06-05T00:00:00Z' }, // oldest → chosen
      'agent-john':    { lastRoutedAt: '2026-06-08T00:00:00Z' },
      'agent-viviane': { lastRoutedAt: '2026-06-09T00:00:00Z' },
    })
    expect(resolveRoutedAgent(null, agents)).toBe('agent-dylan')
  })

  it('spreads consecutive leads across agents (not all to the same one)', () => {
    // Simulate 4 consecutive round-robin assignments, updating lastRoutedAt each time.
    const agents = roster()
    const picks: string[] = []
    let clock = Date.parse('2026-06-12T00:00:00Z')
    for (let i = 0; i < 4; i++) {
      const chosen = resolveRoutedAgent(null, agents)!
      picks.push(chosen)
      clock += 1000
      const a = agents.find(x => x.id === chosen)!
      a.lastRoutedAt = new Date(clock).toISOString()
    }
    // 4 eligible agents (Melanie excluded) → 4 distinct picks.
    expect(new Set(picks).size).toBe(4)
    expect(picks).not.toContain('agent-melanie')
  })
})

describe('resolveRoutedAgent — degenerate', () => {
  it('returns null when no eligible agent exists', () => {
    const onlyMelanie: RoutingAgent[] = [
      { id: 'agent-melanie', active: true, specialty: 'first_buyer', lastRoutedAt: null },
    ]
    expect(resolveRoutedAgent(null, onlyMelanie)).toBeNull()
  })

  it('returns null when all agents are inactive', () => {
    const agents = roster({
      'agent-adriana': { active: false }, 'agent-dylan': { active: false },
      'agent-john': { active: false }, 'agent-viviane': { active: false }, 'agent-melanie': { active: false },
    })
    expect(resolveRoutedAgent(null, agents)).toBeNull()
  })
})
