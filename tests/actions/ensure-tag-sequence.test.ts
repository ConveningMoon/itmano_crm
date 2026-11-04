import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'

vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/data/tag-sequences', () => ({ getTenantLanguages: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getTenantLanguages } from '@/lib/data/tag-sequences'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTagSequenceSlot } from '@/app/(dashboard)/emails/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockLangs = getTenantLanguages as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>

function asRole(role: TenantContext['role'], tenant_id: string | null = 'tenant-x') {
  mockCtx.mockResolvedValue({
    user_id: 'u', email: 'u@test.itmano.com', role, tenant_id,
    agent_id: role === 'agent' ? 'agent-self' : null, acting_as_tenant: false,
  } satisfies TenantContext)
}

// Cliente falso: registra filtros e inserts por tabla.
interface Fake {
  tag: { id: string; name: string; requires_sequence: boolean } | null
  // Respuestas sucesivas del select de email_sequences (null = no hay fila).
  existing: ({ id: string } | null)[]
  insert: { data: { id: string } | null; error: { code?: string; message: string } | null }
}
function fakeClient(f: Fake) {
  const calls = { inserts: [] as unknown[], filters: [] as [string, string, unknown][] }
  let seqSelects = 0
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { calls.filters.push([table, c, v]); return q }
      q.insert = (row: unknown) => { calls.inserts.push(row); return q }
      q.single = async () => f.insert
      q.maybeSingle = async () => {
        if (table === 'lead_tags') return { data: f.tag, error: null }
        const data = f.existing[Math.min(seqSelects++, f.existing.length - 1)] ?? null
        return { data, error: null }
      }
      return q
    },
  }
  return { client, calls }
}

const okTag = { id: 'tag-1', name: 'Comprador', requires_sequence: true }
const created = { data: { id: 'n' }, error: null }

beforeEach(() => {
  mockCtx.mockReset(); mockLangs.mockReset(); mockAdmin.mockReset()
  mockLangs.mockResolvedValue(['es', 'en'])
})

describe('ensureTagSequenceSlot', () => {
  it('un agent recibe error y no escribe', async () => {
    asRole('agent')
    const { client, calls } = fakeClient({ tag: okTag, existing: [null], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res.ok).toBe(false)
    expect(calls.inserts).toHaveLength(0)
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('otro tenant: la etiqueta no se encuentra y no escribe', async () => {
    asRole('agent_owner')
    const { client, calls } = fakeClient({ tag: null, existing: [null], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-de-otro', 'en')
    expect(res.ok).toBe(false)
    expect(calls.inserts).toHaveLength(0)
    expect(calls.filters).toContainEqual(['lead_tags', 'tenant_id', 'tenant-x'])
  })

  it('super_admin sin tenant seleccionado: error y no escribe', async () => {
    asRole('super_admin', null)
    const { client, calls } = fakeClient({ tag: okTag, existing: [null], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res.ok).toBe(false)
    expect(calls.inserts).toHaveLength(0)
  })

  it('idioma que el equipo no atiende: error y no escribe', async () => {
    asRole('agent_owner')
    const { client, calls } = fakeClient({ tag: okTag, existing: [null], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'pt')
    expect(res.ok).toBe(false)
    expect(calls.inserts).toHaveLength(0)
  })

  it('etiqueta que ya no es obligatoria: error y no escribe', async () => {
    asRole('agent_owner')
    const { client, calls } = fakeClient({ tag: { ...okTag, requires_sequence: false }, existing: [null], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res.ok).toBe(false)
    expect(calls.inserts).toHaveLength(0)
  })

  it('si ya existe para ese idioma, devuelve su id sin crear otra', async () => {
    asRole('agent_owner')
    const { client, calls } = fakeClient({ tag: okTag, existing: [{ id: 'seq-existente' }], insert: created })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res).toEqual({ ok: true, id: 'seq-existente' })
    expect(calls.inserts).toHaveLength(0)
  })

  it('crea con la misma forma que ensure_tag_email_sequences', async () => {
    asRole('agent_owner')
    const { client, calls } = fakeClient({ tag: okTag, existing: [null], insert: { data: { id: 'nueva' }, error: null } })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res).toEqual({ ok: true, id: 'nueva' })
    expect(calls.inserts).toEqual([{
      tenant_id: 'tenant-x',
      name: 'Comprador · EN',
      language: 'en',
      description: 'Correo automático de la etiqueta "Comprador".',
      activation_type: 'tag',
      trigger_tag_id: 'tag-1',
      agent_id: null,
      active: true,
    }])
  })

  it('carrera (23505): relee y devuelve la que ganó', async () => {
    asRole('agent_owner')
    const { client } = fakeClient({
      tag: okTag,
      existing: [null, { id: 'ganadora' }],
      insert: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    mockAdmin.mockReturnValue(client)
    const res = await ensureTagSequenceSlot('tag-1', 'en')
    expect(res).toEqual({ ok: true, id: 'ganadora' })
  })
})
