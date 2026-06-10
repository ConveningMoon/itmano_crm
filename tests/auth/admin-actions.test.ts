import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Mock the auth context so we control the caller's role. The gate (super_admin)
// and zod validation both run BEFORE any DB/admin-API call, so these cases never
// touch Supabase — the DB-dependent branches (duplicate slug, owner-exists,
// existing-profile) are verified via the MCP rollback test instead.
vi.mock('@/lib/auth/tenant-context', () => ({
  getCurrentTenantContext: vi.fn(),
}))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createTenant, provisionOwner } from '@/app/(dashboard)/admin/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>

function asRole(role: TenantContext['role']) {
  mockCtx.mockResolvedValue({
    user_id:   'u-test',
    role,
    tenant_id: role === 'super_admin' ? null : 'tenant-x',
    agent_id:  null,
  } satisfies TenantContext)
}

beforeEach(() => {
  mockCtx.mockReset()
})

describe('createTenant — gate + validation', () => {
  it('rejects a non-super_admin caller', async () => {
    asRole('agent_owner')
    const res = await createTenant({ name: 'X', slug: 'x' })
    expect(res.ok).toBe(false)
  })

  it('rejects an agent caller', async () => {
    asRole('agent')
    const res = await createTenant({ name: 'X', slug: 'x' })
    expect(res.ok).toBe(false)
  })

  it('rejects an empty name', async () => {
    asRole('super_admin')
    const res = await createTenant({ name: '   ', slug: 'valid-slug' })
    expect(res.ok).toBe(false)
  })

  it('rejects a non-kebab slug', async () => {
    asRole('super_admin')
    const res = await createTenant({ name: 'Valid', slug: 'Not Kebab' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/kebab/i)
  })

  it('rejects an invalid hex color', async () => {
    asRole('super_admin')
    const res = await createTenant({ name: 'Valid', slug: 'valid-slug', primaryColor: 'blue' })
    expect(res.ok).toBe(false)
  })
})

describe('provisionOwner — gate + validation', () => {
  it('rejects a non-super_admin caller', async () => {
    asRole('agent_owner')
    const res = await provisionOwner({ tenantId: 'tenant-x', email: 'a@b.com' })
    expect(res.ok).toBe(false)
  })

  it('rejects an invalid email', async () => {
    asRole('super_admin')
    const res = await provisionOwner({ tenantId: 'tenant-x', email: 'not-an-email' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/email/i)
  })
})
