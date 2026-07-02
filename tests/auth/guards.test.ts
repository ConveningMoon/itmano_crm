import { describe, it, expect } from 'vitest'
import { requireWriteAccess, assertCanWriteLead, assertCanWriteProperty } from '@/lib/auth/guards'
import type { TenantContext } from '@/lib/auth/tenant-context'

// ─── Context factories ────────────────────────────────────────────────────────

const superAdmin: TenantContext = {
  user_id: 'u-super', role: 'super_admin', tenant_id: null, agent_id: null,
}
const ownerA: TenantContext = {
  user_id: 'u-owner-a', role: 'agent_owner', tenant_id: 'tenant-a', agent_id: null,
}
const agentA1: TenantContext = {
  user_id: 'u-agent-a1', role: 'agent', tenant_id: 'tenant-a', agent_id: 'agent-a1',
}

// ─── requireWriteAccess (sources / email / settings / agents) ─────────────────

describe('requireWriteAccess', () => {
  it('agent is denied (read-only on shared resources)', () => {
    const denied = requireWriteAccess(agentA1)
    expect(denied).not.toBeNull()
    expect(denied?.ok).toBe(false)
    expect(denied?.error).toBeTruthy()
  })

  it('agent_owner is allowed', () => {
    expect(requireWriteAccess(ownerA)).toBeNull()
  })

  it('super_admin is allowed', () => {
    expect(requireWriteAccess(superAdmin)).toBeNull()
  })
})

// ─── assertCanWriteLead (per-tenant + per-agent attribution) ──────────────────

describe('assertCanWriteLead', () => {
  const leadOwnedByA1 = { tenant_id: 'tenant-a', agent_id: 'agent-a1' }
  const leadOwnedByA2 = { tenant_id: 'tenant-a', agent_id: 'agent-a2' }
  const leadInTenantB = { tenant_id: 'tenant-b', agent_id: 'agent-b1' }

  it('super_admin can write any lead, any tenant', () => {
    expect(assertCanWriteLead(superAdmin, leadOwnedByA1)).toBeNull()
    expect(assertCanWriteLead(superAdmin, leadInTenantB)).toBeNull()
  })

  it('agent_owner can write any lead in their own tenant', () => {
    expect(assertCanWriteLead(ownerA, leadOwnedByA1)).toBeNull()
    expect(assertCanWriteLead(ownerA, leadOwnedByA2)).toBeNull()
  })

  it('agent_owner CANNOT write a lead in another tenant (cross-tenant hole closed)', () => {
    const denied = assertCanWriteLead(ownerA, leadInTenantB)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre este lead')
  })

  it('agent can write their OWN lead (same tenant, same agent_id)', () => {
    expect(assertCanWriteLead(agentA1, leadOwnedByA1)).toBeNull()
  })

  it('agent CANNOT write another agent\'s lead in the same tenant', () => {
    const denied = assertCanWriteLead(agentA1, leadOwnedByA2)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre este lead')
  })

  it('agent CANNOT write a lead in another tenant', () => {
    const denied = assertCanWriteLead(agentA1, leadInTenantB)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre este lead')
  })
})

// ─── assertCanWriteProperty (tenant-scoped + per-creator authorship) ──────────

describe('assertCanWriteProperty', () => {
  const propByAgent = { tenant_id: 'tenant-a', created_by_user_id: 'u-agent-a1' }
  const propByOwner = { tenant_id: 'tenant-a', created_by_user_id: 'u-owner-a' }
  const propByNobody = { tenant_id: 'tenant-a', created_by_user_id: null }
  const propForeign  = { tenant_id: 'tenant-b', created_by_user_id: 'u-agent-b1' }

  it('super_admin can write any property in any tenant', () => {
    expect(assertCanWriteProperty(superAdmin, propByAgent)).toBeNull()
    expect(assertCanWriteProperty(superAdmin, propForeign)).toBeNull()
    expect(assertCanWriteProperty(superAdmin, propByNobody)).toBeNull()
  })

  it('agent_owner can write any property in their tenant', () => {
    expect(assertCanWriteProperty(ownerA, propByAgent)).toBeNull()
    expect(assertCanWriteProperty(ownerA, propByOwner)).toBeNull()
    expect(assertCanWriteProperty(ownerA, propByNobody)).toBeNull()
  })

  it('agent_owner CANNOT write a property in another tenant', () => {
    const denied = assertCanWriteProperty(ownerA, propForeign)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre esta propiedad')
  })

  it('agent can write a property they created', () => {
    expect(assertCanWriteProperty(agentA1, propByAgent)).toBeNull()
  })

  it("agent CANNOT write another user's property in the same tenant", () => {
    const denied = assertCanWriteProperty(agentA1, propByOwner)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre esta propiedad')
  })

  it('agent CANNOT write a property with null created_by_user_id (created by super_admin)', () => {
    const denied = assertCanWriteProperty(agentA1, propByNobody)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre esta propiedad')
  })

  it('agent CANNOT write a property in another tenant', () => {
    const denied = assertCanWriteProperty(agentA1, propForeign)
    expect(denied).not.toBeNull()
    expect(denied?.error).toBe('No tienes permiso sobre esta propiedad')
  })
})
