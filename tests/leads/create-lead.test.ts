import { describe, it, expect, vi, beforeEach } from 'vitest'

// Alta manual (Server Action createLead): no debe llegar a la base con datos
// que el CHECK rechaza, debe avisar de un email repetido en el tenant y sólo
// prometer secuencia cuando el lead entró en una.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/subscriptions/entitlements-server', () => ({ assertEntitlement: vi.fn(async () => null) }))
vi.mock('@/lib/services/emit-lead-created', () => ({ emitLeadCreated: vi.fn() }))
vi.mock('@/lib/services/enroll-lead-in-sequence', () => ({
  enrollLeadInSequence: vi.fn(async () => ({ enrolled: false })),
}))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/app/(dashboard)/leads/new/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>

function fakeDb(existing: Record<string, unknown> | null) {
  const inserts: Record<string, unknown>[] = []
  const ilikes: string[] = []
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        ilike: (_col: string, value: string) => { ilikes.push(value); return q },
        limit: () => q,
        maybeSingle: async () => ({ data: existing, error: null }),
        insert: async (row: Record<string, unknown>) => { inserts.push({ table, ...row }); return { error: null } },
      }
      return q
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
  return { client, inserts, ilikes }
}

const input = {
  firstName: 'Ana', lastName: 'Ruiz', email: ' Ana_1@Example.com ', phone: '(555) 123-4567',
  language: 'es' as const, agentId: 'agent-1', acquisitionChannelId: '', channelType: 'manual',
  lender: null, notes: null,
}

beforeEach(() => {
  mockCtx.mockResolvedValue({
    user_id: 'u-owner', email: 'owner@example.com', role: 'agent_owner',
    tenant_id: 'tenant-x', agent_id: 'agent-1', acting_as_tenant: false,
  })
})

describe('createLead', () => {
  it('rechaza un idioma vacío sin tocar la base', async () => {
    const db = fakeDb(null)
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead({ ...input, language: '' as never })
    expect(res).toMatchObject({ ok: false, field: 'language' })
    expect(db.inserts).toHaveLength(0)
  })

  it('rechaza un teléfono inválido', async () => {
    const db = fakeDb(null)
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead({ ...input, phone: 'abc' })
    expect(res).toMatchObject({ ok: false, field: 'phone' })
    expect(db.inserts).toHaveLength(0)
  })

  it('avisa del email repetido en el tenant y no inserta', async () => {
    const db = fakeDb({ id: 'lead-old', first_name: 'Ana', last_name: 'Ruiz', email: 'ana_1@example.com' })
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead(input)
    expect(res).toMatchObject({ ok: false, duplicate: { leadId: 'lead-old', name: 'Ana Ruiz' } })
    expect(db.inserts).toHaveLength(0)
    // El "_" del email se escapa para que ILIKE lo compare literal.
    expect(db.ilikes[0]).toBe('ana\\_1@example.com')
  })

  it('con allowDuplicate registra igualmente, normaliza email y no promete secuencia', async () => {
    const db = fakeDb({ id: 'lead-old', first_name: 'Ana', last_name: null, email: 'x' })
    mockAdmin.mockReturnValue(db.client)
    const res = await createLead({ ...input, allowDuplicate: true })
    expect(res).toMatchObject({ ok: true, enrolledInSequence: false })
    expect(db.inserts[0]).toMatchObject({ table: 'leads', email: 'ana_1@example.com', phone: '(555) 123-4567' })
  })
})
