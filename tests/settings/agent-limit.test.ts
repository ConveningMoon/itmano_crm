import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tope de agentes por plan: createAgent consulta assertEntitlement antes de insertar.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/subscriptions/entitlements-server', () => ({ assertEntitlement: vi.fn() }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertEntitlement } from '@/lib/subscriptions/entitlements-server'
import { createAgent } from '@/app/(dashboard)/settings/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockAssert = assertEntitlement as unknown as ReturnType<typeof vi.fn>

const BLOCKED = { ok: false, error: 'Tu plan incluye un solo agente.' }

function fakeDb() {
  const inserts: unknown[] = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'ilike', 'like', 'limit', 'order']) q[m] = () => q
  q.maybeSingle = async () => ({ data: null, error: null })
  q.then = (res: (v: unknown) => void) => res({ data: [], error: null })
  q.insert = (row: unknown) => { inserts.push(row); return Promise.resolve({ error: null }) }
  return { client: { from: () => q }, inserts }
}

const input = {
  name: 'Luis Pérez', email: 'luis@example.com', language: 'es',
  avatarInitials: 'LP', accentColor: '#C9A84C',
}

function ctx(role: string) {
  mockCtx.mockResolvedValue({
    user_id: 'u1', email: 'o@example.com', role, tenant_id: 'tenant-x', agent_id: 'a1', acting_as_tenant: false,
  })
}

beforeEach(() => mockAssert.mockReset())

describe('límite de agentes', () => {
  it('growth no crea un segundo agente', async () => {
    ctx('agent_owner')
    mockAssert.mockResolvedValue(BLOCKED)
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    const res = await createAgent(input)
    expect(res).toEqual(BLOCKED)
    expect(db.inserts).toHaveLength(0)
    expect(mockAssert).toHaveBeenCalledWith('tenant-x', 'createAgent', { isSuperAdmin: false })
  })

  it('super_admin pasa isSuperAdmin: true y crea', async () => {
    ctx('super_admin')
    mockAssert.mockResolvedValue(null)
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    const res = await createAgent({ ...input, tenantId: 'tenant-x' })
    expect(mockAssert).toHaveBeenCalledWith('tenant-x', 'createAgent', { isSuperAdmin: true })
    expect(res.ok).toBe(true)
    expect(db.inserts).toHaveLength(1)
  })
})
