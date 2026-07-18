import { describe, it, expect } from 'vitest'
import { resolveRoutedAgent, type RoutingAgent } from '@/lib/services/route-channel-agent'

// A&J-like roster: Adriana (login), Dylan, John, Viviane, Melanie.
function roster(overrides: Partial<Record<string, Partial<RoutingAgent>>> = {}): RoutingAgent[] {
  const base: Record<string, RoutingAgent> = {
    'agent-adriana': { id: 'agent-adriana', active: true },
    'agent-dylan':   { id: 'agent-dylan',   active: true },
    'agent-john':    { id: 'agent-john',    active: true },
    'agent-viviane': { id: 'agent-viviane', active: true },
    'agent-melanie': { id: 'agent-melanie', active: true },
  }
  for (const [id, o] of Object.entries(overrides)) base[id] = { ...base[id], ...o }
  return Object.values(base)
}

describe('resolveRoutedAgent — explicit channel agent', () => {
  it('returns the linked agent when it is active', () => {
    expect(resolveRoutedAgent('agent-john', roster())).toBe('agent-john')
  })

  it('any agent can be explicitly linked', () => {
    expect(resolveRoutedAgent('agent-melanie', roster())).toBe('agent-melanie')
  })

  it('falls back to adriana when the linked agent is inactive', () => {
    const agents = roster({ 'agent-john': { active: false } })
    expect(resolveRoutedAgent('agent-john', agents)).toBe('agent-adriana')
  })

  it('falls back to adriana when the linked agent id is unknown', () => {
    expect(resolveRoutedAgent('agent-ghost', roster())).toBe('agent-adriana')
  })
})

describe('resolveRoutedAgent — "Toda la agencia" (null channelAgentId)', () => {
  it('always picks agent-adriana when she is active', () => {
    expect(resolveRoutedAgent(null, roster())).toBe('agent-adriana')
  })

  it('picks agent-adriana regardless of which other agents are present', () => {
    const agents = roster()
    expect(resolveRoutedAgent(null, agents)).toBe('agent-adriana')
  })

  it('falls back to first active agent by id when adriana is inactive', () => {
    const agents = roster({ 'agent-adriana': { active: false } })
    // Next alphabetically among active: agent-dylan.
    expect(resolveRoutedAgent(null, agents)).toBe('agent-dylan')
  })

  it('falls back to first active agent when adriana is absent from the roster', () => {
    const agents: RoutingAgent[] = [
      { id: 'agent-john',    active: true },
      { id: 'agent-viviane', active: true },
      { id: 'agent-dylan',   active: true },
    ]
    // Alphabetical: agent-dylan < agent-john < agent-viviane.
    expect(resolveRoutedAgent(null, agents)).toBe('agent-dylan')
  })
})

describe('resolveRoutedAgent — degenerate', () => {
  it('falls back to the only active agent', () => {
    const onlyMelanie: RoutingAgent[] = [
      { id: 'agent-melanie', active: true },
    ]
    // No adriana, one active agent → last-resort fallback returns her.
    expect(resolveRoutedAgent(null, onlyMelanie)).toBe('agent-melanie')
  })

  it('returns null when all agents are inactive', () => {
    const agents = roster({
      'agent-adriana': { active: false }, 'agent-dylan':   { active: false },
      'agent-john':    { active: false }, 'agent-viviane': { active: false },
      'agent-melanie': { active: false },
    })
    expect(resolveRoutedAgent(null, agents)).toBeNull()
  })

  it('returns null when the roster is empty', () => {
    expect(resolveRoutedAgent(null, [])).toBeNull()
  })
})
