import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'

// `toggleSubmissionResponded` dejó de pedir requireWriteAccess (que bloqueaba al
// rol 'agent' en bloque) y pasó a exigir que el LEAD sea suyo. El guard está
// probado aparte en guards.test.ts; lo que se fija aquí es el CABLEADO: que la
// action lea el lead de la solicitud y no escriba cuando el lead es de otro.

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))

// Fila que devuelve el maybeSingle() de form_submissions.
let row: unknown = null
// Lo que se le pasó a .update(), o null si nunca se llamó — la prueba de que la
// denegación corta ANTES de escribir.
let updated: Record<string, unknown> | null = null

function fakeQuery(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      // El update se espera con `await uq` (thenable), no con maybeSingle.
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
      if (prop === 'maybeSingle') return () => Promise.resolve({ data: row, error: null })
      return (...args: unknown[]) => {
        if (prop === 'update') updated = args[0] as Record<string, unknown>
        return q
      }
    },
  })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => fakeQuery() }),
}))

const { getCurrentTenantContext } = await import('@/lib/auth/tenant-context')
const { toggleSubmissionResponded } = await import('@/app/(dashboard)/sources/actions')

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>

function asRole(role: TenantContext['role'], agentId: string | null = null) {
  mockCtx.mockResolvedValue({
    user_id: 'u-test', email: 'u@test.itmano.com', role,
    tenant_id: role === 'super_admin' ? null : 'tenant-aj',
    agent_id: role === 'agent' ? agentId : null,
    acting_as_tenant: false,
  } satisfies TenantContext)
}

/** Solicitud de un contact_form cuyo lead está asignado a `agentId`. */
function submissionOf(agentId: string, channelType = 'contact_form') {
  return {
    id: 'sub-1',
    responded: false,
    acquisition_channels: { channel_type: channelType },
    leads: { tenant_id: 'tenant-aj', agent_id: agentId },
  }
}

beforeEach(() => {
  mockCtx.mockReset()
  row = null
  updated = null
})

describe('toggleSubmissionResponded — el permiso es el del lead', () => {
  it('el agente marca la solicitud de SU lead', async () => {
    asRole('agent', 'agent-melanie')
    row = submissionOf('agent-melanie')

    const res = await toggleSubmissionResponded('sub-1')
    expect(res.ok).toBe(true)
    expect(updated?.responded).toBe(true)
  })

  it('el agente NO puede marcar la de un lead ajeno, y no se escribe nada', async () => {
    asRole('agent', 'agent-melanie')
    row = submissionOf('agent-john')

    const res = await toggleSubmissionResponded('sub-1')
    expect(res.ok).toBe(false)
    // Lo que de verdad importa: cortó antes del update.
    expect(updated).toBeNull()
  })

  it('el propietario marca cualquiera de su tenant', async () => {
    asRole('agent_owner')
    row = submissionOf('agent-john')

    expect((await toggleSubmissionResponded('sub-1')).ok).toBe(true)
  })

  it('el super_admin no queda atrapado por el scope', async () => {
    asRole('super_admin')
    row = submissionOf('agent-john')

    expect((await toggleSubmissionResponded('sub-1')).ok).toBe(true)
  })

  it('desmarca cuando ya estaba respondida', async () => {
    asRole('agent', 'agent-melanie')
    row = { ...submissionOf('agent-melanie'), responded: true }

    expect((await toggleSubmissionResponded('sub-1')).ok).toBe(true)
    expect(updated?.responded).toBe(false)
    expect(updated?.responded_at).toBeNull()
  })

  it('los lead magnets siguen sin usar estado de respuesta', async () => {
    asRole('agent', 'agent-melanie')
    row = submissionOf('agent-melanie', 'lead_magnet')

    const res = await toggleSubmissionResponded('sub-1')
    expect(res.ok).toBe(false)
    expect(updated).toBeNull()
  })

  it('una solicitud inexistente no revela nada', async () => {
    asRole('agent', 'agent-melanie')
    row = null

    const res = await toggleSubmissionResponded('sub-1')
    expect(res.ok).toBe(false)
  })
})
