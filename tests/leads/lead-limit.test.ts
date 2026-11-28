import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Límite blando de leads por plan: el alta manual y la importación consultan
// assertEntitlement antes de insertar; el intake nunca lo hace.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/services/emit-lead-created', () => ({ emitLeadCreated: vi.fn() }))
vi.mock('@/lib/services/enroll-lead-in-sequence', () => ({
  enrollLeadInSequence: vi.fn(async () => ({ enrolled: false })),
}))
vi.mock('@/lib/subscriptions/entitlements-server', () => ({ assertEntitlement: vi.fn() }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertEntitlement } from '@/lib/subscriptions/entitlements-server'
import { createLead, createLeadsBulk } from '@/app/(dashboard)/leads/new/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockAssert = assertEntitlement as unknown as ReturnType<typeof vi.fn>

const BLOCKED = { ok: false, error: 'Llegaste al límite de leads de tu plan.' }

function fakeDb() {
  const inserts: Record<string, unknown>[] = []
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        ilike: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: { id: 'agent-1' }, error: null }),
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
        insert: (row: unknown) => {
          inserts.push({ table, row })
          return { select: async () => ({ data: [], error: null }), then: (res: (v: unknown) => void) => res({ error: null }) }
        },
      }
      return q
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
  return { client, inserts }
}

const input = {
  firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com', phone: '(555) 123-4567',
  language: 'es' as const, agentId: 'agent-1', acquisitionChannelId: '', channelType: 'manual',
  lender: null, notes: null,
}

const bulkRow = (email: string) => ({
  firstName: 'A', lastName: 'B', email, phone: null, language: 'es' as const,
  stage: 'nuevo' as const, lender: null, notes: null,
})

beforeEach(() => {
  mockAssert.mockReset()
  mockCtx.mockResolvedValue({
    user_id: 'u-owner', email: 'owner@example.com', role: 'agent_owner',
    tenant_id: 'tenant-x', agent_id: 'agent-1', acting_as_tenant: false,
  })
})

describe('límite de leads', () => {
  it('alta manual bloqueada al 110% devuelve el mensaje', async () => {
    mockAssert.mockResolvedValue(BLOCKED)
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead(input)
    expect(res).toEqual({ ok: false, error: BLOCKED.error })
    expect(db.inserts).toHaveLength(0)
    expect(mockAssert).toHaveBeenCalledWith('tenant-x', 'createLead', { isSuperAdmin: false })
  })

  it('alta manual permitida inserta', async () => {
    mockAssert.mockResolvedValue(null)
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead({ ...input, allowDuplicate: true })
    expect(res).toMatchObject({ ok: true })
    expect(db.inserts).toHaveLength(1)
  })

  it('importación que cruzaría el 110% no inserta nada', async () => {
    mockAssert.mockResolvedValue(BLOCKED)
    const db = fakeDb()
    mockAdmin.mockReturnValue(db.client)
    const res = await createLeadsBulk([bulkRow('a@example.com'), bulkRow('b@example.com')], 'agent-1')
    expect(res).toEqual({ ok: false, error: BLOCKED.error })
    expect(db.inserts).toHaveLength(0)
    expect(mockAssert).toHaveBeenCalledWith('tenant-x', 'createLead', { isSuperAdmin: false, extraRows: 2 })
  })

  it('Agent API: POST /leads bloqueado lanza ApiError sin insertar', async () => {
    mockAssert.mockResolvedValue(BLOCKED)
    const { createLead: apiCreateLead } = await import('@/lib/agent-api/queries/writes')
    const from = vi.fn()
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.com', owner: 'agent-1', first_name: 'A', last_name: 'B', intent: 'buy' }),
    })
    await expect(apiCreateLead({ tenantId: 'tenant-x', db: { from } } as never, req))
      .rejects.toMatchObject({ code: 'unprocessable', message: BLOCKED.error })
    expect(from).not.toHaveBeenCalled()
  })

  it('intake no importa entitlements', () => {
    const file = path.join(process.cwd(), 'src/app/api/intake/[publicId]/submit/route.ts')
    expect(readFileSync(file, 'utf8')).not.toMatch(/entitlements/)
  })
})
