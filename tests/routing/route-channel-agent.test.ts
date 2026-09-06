import { describe, it, expect } from 'vitest'
import { resolveRoutedAgent, type RoutingAgent } from '@/lib/services/route-channel-agent'

// A&J-like roster: Adriana (owner, con login), Dylan, John, Viviane, Melanie.
// El owner ya no es un id concreto: es la fila vinculada al login con rol
// 'agent_owner'. Por eso los casos de abajo mueven `isOwner`, no el nombre.
function roster(overrides: Partial<Record<string, Partial<RoutingAgent>>> = {}): RoutingAgent[] {
  const base: Record<string, RoutingAgent> = {
    'agent-adriana': { id: 'agent-adriana', active: true,  isOwner: true  },
    'agent-dylan':   { id: 'agent-dylan',   active: true,  isOwner: false },
    'agent-john':    { id: 'agent-john',    active: true,  isOwner: false },
    'agent-viviane': { id: 'agent-viviane', active: true,  isOwner: false },
    'agent-melanie': { id: 'agent-melanie', active: true,  isOwner: false },
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

  it('falls back to the owner when the linked agent is inactive', () => {
    const agents = roster({ 'agent-john': { active: false } })
    expect(resolveRoutedAgent('agent-john', agents)).toBe('agent-adriana')
  })

  it('falls back to the owner when the linked agent id is unknown', () => {
    expect(resolveRoutedAgent('agent-ghost', roster())).toBe('agent-adriana')
  })
})

describe('resolveRoutedAgent — "Toda la agencia" (null channelAgentId)', () => {
  it('picks the owner agent when it is active', () => {
    expect(resolveRoutedAgent(null, roster())).toBe('agent-adriana')
  })

  // La regla vieja era un id literal ('agent-adriana'). Este caso es el que
  // fallaba en cualquier tenant que no fuera A&J: el owner se llama distinto.
  it('picks the owner whatever its id is', () => {
    const otroTenant: RoutingAgent[] = [
      { id: 'agent-zoe',   active: true, isOwner: true  },
      { id: 'agent-ana',   active: true, isOwner: false },
      { id: 'agent-bruno', active: true, isOwner: false },
    ]
    // Alfabéticamente sería agent-ana; manda ser el propietario.
    expect(resolveRoutedAgent(null, otroTenant)).toBe('agent-zoe')
  })

  it('falls back to first active agent by id when the owner is inactive', () => {
    const agents = roster({ 'agent-adriana': { active: false } })
    // Next alphabetically among active: agent-dylan.
    expect(resolveRoutedAgent(null, agents)).toBe('agent-dylan')
  })

  it('falls back to first active agent when no one is flagged as owner', () => {
    const agents: RoutingAgent[] = [
      { id: 'agent-john',    active: true, isOwner: false },
      { id: 'agent-viviane', active: true, isOwner: false },
      { id: 'agent-dylan',   active: true, isOwner: false },
    ]
    // Alphabetical: agent-dylan < agent-john < agent-viviane.
    expect(resolveRoutedAgent(null, agents)).toBe('agent-dylan')
  })

  it('breaks a tie between two owners by id, not by query order', () => {
    const dosOwners: RoutingAgent[] = [
      { id: 'agent-nadia', active: true, isOwner: true },
      { id: 'agent-hugo',  active: true, isOwner: true },
    ]
    expect(resolveRoutedAgent(null, dosOwners)).toBe('agent-hugo')
    expect(resolveRoutedAgent(null, [...dosOwners].reverse())).toBe('agent-hugo')
  })

  it('skips an inactive owner in favour of an active one', () => {
    const agents = roster({
      'agent-adriana': { active: false },
      'agent-melanie': { isOwner: true },
    })
    expect(resolveRoutedAgent(null, agents)).toBe('agent-melanie')
  })
})

describe('resolveRoutedAgent — degenerate', () => {
  it('falls back to the only active agent', () => {
    const onlyMelanie: RoutingAgent[] = [
      { id: 'agent-melanie', active: true, isOwner: false },
    ]
    // Sin owner y con un solo activo → último recurso: ella.
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
