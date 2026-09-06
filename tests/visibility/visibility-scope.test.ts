import { describe, it, expect } from 'vitest'
import {
  scopeFor, isAgentScoped, applyVisibilityScope, isRowVisible,
  type VisibilityScope,
} from '@/lib/auth/visibility'

// Fake PostgREST builder: records every .eq(column, value) and stays chainable.
function fakeQuery() {
  const calls: Array<{ column: string; value: unknown }> = []
  const q = {
    calls,
    eq(column: string, value: unknown) { calls.push({ column, value }); return q },
  }
  return q
}

const SUPER:  Parameters<typeof scopeFor>[0] = { role: 'super_admin', tenant_id: null,        agent_id: null }
const OWNER:  Parameters<typeof scopeFor>[0] = { role: 'agent_owner', tenant_id: 'tenant-aj',  agent_id: null }
const AGENT:  Parameters<typeof scopeFor>[0] = { role: 'agent',       tenant_id: 'tenant-aj',  agent_id: 'agent-dylan' }

describe('scopeFor — derives scope from context', () => {
  it('super_admin → no tenant, no agent', () => {
    expect(scopeFor(SUPER)).toEqual({ tenantId: null, agentId: null })
  })
  it('agent_owner → tenant only', () => {
    expect(scopeFor(OWNER)).toEqual({ tenantId: 'tenant-aj', agentId: null })
  })
  it('agent → tenant + agent_id', () => {
    expect(scopeFor(AGENT)).toEqual({ tenantId: 'tenant-aj', agentId: 'agent-dylan' })
  })
  it('agent_id is ignored for non-agent roles even if present', () => {
    expect(scopeFor({ role: 'agent_owner', tenant_id: 'tenant-aj', agent_id: 'agent-x' }))
      .toEqual({ tenantId: 'tenant-aj', agentId: null })
  })
})

describe('isAgentScoped', () => {
  it('true only for agent scope', () => {
    expect(isAgentScoped(scopeFor(AGENT))).toBe(true)
    expect(isAgentScoped(scopeFor(OWNER))).toBe(false)
    expect(isAgentScoped(scopeFor(SUPER))).toBe(false)
  })
})

describe('applyVisibilityScope — query filters per role × surface', () => {
  it('super_admin → applies NO filter', () => {
    const q = applyVisibilityScope(fakeQuery(), scopeFor(SUPER))
    expect(q.calls).toEqual([])
  })

  it('agent_owner → tenant filter only', () => {
    const q = applyVisibilityScope(fakeQuery(), scopeFor(OWNER))
    expect(q.calls).toEqual([{ column: 'tenant_id', value: 'tenant-aj' }])
  })

  it('agent → tenant + agent_id (default column)', () => {
    const q = applyVisibilityScope(fakeQuery(), scopeFor(AGENT))
    expect(q.calls).toEqual([
      { column: 'tenant_id', value: 'tenant-aj' },
      { column: 'agent_id',  value: 'agent-dylan' },
    ])
  })

  it('agent → honours a custom column name', () => {
    const q = applyVisibilityScope(fakeQuery(), scopeFor(AGENT), { column: 'owner_agent_id' })
    expect(q.calls).toEqual([
      { column: 'tenant_id',      value: 'tenant-aj' },
      { column: 'owner_agent_id', value: 'agent-dylan' },
    ])
  })

  // Surface matrix: leads, channels, sequences all use agent_id → identical filters.
  it.each(['leads', 'acquisition_channels', 'email_sequences'])(
    'agent scope on %s applies the same two filters', () => {
      const q = applyVisibilityScope(fakeQuery(), scopeFor(AGENT))
      expect(q.calls).toEqual([
        { column: 'tenant_id', value: 'tenant-aj' },
        { column: 'agent_id',  value: 'agent-dylan' },
      ])
    },
  )
})

describe('isRowVisible — in-memory guard for detail pages', () => {
  const agentScope: VisibilityScope = { tenantId: 'tenant-aj', agentId: 'agent-dylan' }
  const ownerScope: VisibilityScope = { tenantId: 'tenant-aj', agentId: null }
  const superScope: VisibilityScope = { tenantId: null, agentId: null }

  it('null row → never visible', () => {
    expect(isRowVisible(agentScope, null)).toBe(false)
  })

  it('agent sees own-tenant own-agent row', () => {
    expect(isRowVisible(agentScope, { tenant_id: 'tenant-aj', agent_id: 'agent-dylan' })).toBe(true)
  })

  it('agent does NOT see another agent\'s row', () => {
    expect(isRowVisible(agentScope, { tenant_id: 'tenant-aj', agent_id: 'agent-adriana' })).toBe(false)
  })

  it('agent does NOT see a "Toda la agencia" (null agent_id) row', () => {
    expect(isRowVisible(agentScope, { tenant_id: 'tenant-aj', agent_id: null })).toBe(false)
  })

  it('owner sees any agent row in their tenant, but not another tenant', () => {
    expect(isRowVisible(ownerScope, { tenant_id: 'tenant-aj', agent_id: 'agent-adriana' })).toBe(true)
    expect(isRowVisible(ownerScope, { tenant_id: 'tenant-other', agent_id: 'agent-x' })).toBe(false)
  })

  it('super_admin sees any tenant', () => {
    expect(isRowVisible(superScope, { tenant_id: 'tenant-other', agent_id: 'agent-x' })).toBe(true)
  })
})
