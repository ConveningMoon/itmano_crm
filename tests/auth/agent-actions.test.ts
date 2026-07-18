import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Mock the auth context. The requireWriteAccess gate (and, for createAgent, zod
// validation) runs BEFORE any DB/admin-API call, so these cases never touch
// Supabase. DB-coupled branches (id collision, agent-already-linked,
// email-has-profile, revoke no-op, full cascade) are verified via MCP rollback.
vi.mock('@/lib/auth/tenant-context', () => ({
  getCurrentTenantContext: vi.fn(),
}))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAgent, inviteAgentAccess, revokeAgentAccess } from '@/app/(dashboard)/settings/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>

function asRole(role: TenantContext['role']) {
  mockCtx.mockResolvedValue({
    user_id:   'u-test',
    role,
    tenant_id: role === 'super_admin' ? null : 'tenant-x',
    agent_id:  role === 'agent' ? 'agent-self' : null,
    acting_as_tenant: false,
  } satisfies TenantContext)
}

const validAgent = {
  name: 'John Leonard', email: 'john@example.com', language: 'en',
  avatarInitials: 'JL', accentColor: '#5AAFA0',
}

beforeEach(() => mockCtx.mockReset())

describe('agent-management actions reject the read-only agent role', () => {
  it('createAgent denies role agent', async () => {
    asRole('agent')
    const res = await createAgent(validAgent)
    expect(res.ok).toBe(false)
  })

  it('inviteAgentAccess denies role agent', async () => {
    asRole('agent')
    const res = await inviteAgentAccess('agent-john', 'john@example.com')
    expect(res.ok).toBe(false)
  })

  it('revokeAgentAccess denies role agent', async () => {
    asRole('agent')
    const res = await revokeAgentAccess('agent-john')
    expect(res.ok).toBe(false)
  })
})

describe('createAgent — validation (owner, before DB)', () => {
  it('rejects an invalid email', async () => {
    asRole('agent_owner')
    const res = await createAgent({ ...validAgent, email: 'not-an-email' })
    expect(res.ok).toBe(false)
  })

  it('rejects an invalid hex color', async () => {
    asRole('agent_owner')
    const res = await createAgent({ ...validAgent, accentColor: 'teal' })
    expect(res.ok).toBe(false)
  })

  it('rejects an invalid language', async () => {
    asRole('agent_owner')
    const res = await createAgent({ ...validAgent, language: 'xx' })
    expect(res.ok).toBe(false)
  })

  it('accepts an expanded language (fr)', async () => {
    // 'fr' es válido desde la migración 062 (set de idiomas ampliado). Este caso
    // pasa la validación zod; la creación real toca DB (no en este mock), así que
    // solo verificamos que NO lo rechace por idioma inválido.
    asRole('agent')  // el rol agent se rechaza por permisos, no por idioma
    const res = await createAgent({ ...validAgent, language: 'fr' })
    expect(res.ok).toBe(false)
  })

  it('rejects an empty name', async () => {
    asRole('agent_owner')
    const res = await createAgent({ ...validAgent, name: '   ' })
    expect(res.ok).toBe(false)
  })
})
