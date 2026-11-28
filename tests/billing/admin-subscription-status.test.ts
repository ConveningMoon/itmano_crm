import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Centro de control: el formulario conserva el estado que escribe Paddle
// (paused/past_due) y la entrada manual al modo degradado avisa igual que Paddle.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({ getCurrentTenantContext: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
const notifyDegradation = vi.fn()
vi.mock('@/lib/subscriptions/notify-degradation', () => ({
  notifyDegradation: (...a: unknown[]) => notifyDegradation(...a),
}))
const restoreAfterReactivation = vi.fn()
vi.mock('@/lib/subscriptions/reactivate', () => ({
  restoreAfterReactivation: (...a: unknown[]) => restoreAfterReactivation(...a),
}))
vi.mock('@/lib/subscriptions/quota', () => ({ resumeQuotaPausedRuns: vi.fn(async () => 0) }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTenantSubscription } from '@/app/(dashboard)/admin/actions'
import { editableStatus } from '@/app/(dashboard)/admin/admin-client'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>

function fakeDb(prev: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = []
  return {
    upserts,
    client: {
      from() {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: prev, error: null }) }) }),
          upsert: (row: Record<string, unknown>) => { upserts.push(row); return Promise.resolve({ error: null }) },
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      },
    },
  }
}

beforeEach(() => {
  mockCtx.mockReset(); mockAdmin.mockReset(); notifyDegradation.mockReset(); restoreAfterReactivation.mockReset()
  mockCtx.mockResolvedValue({
    user_id: 'u', email: 'a@itmano.com', role: 'super_admin', tenant_id: null, agent_id: null, acting_as_tenant: false,
  } satisfies TenantContext)
})

describe('editableStatus', () => {
  it('conserva paused y past_due; las solicitudes se editan como active', () => {
    expect(editableStatus('paused')).toBe('paused')
    expect(editableStatus('past_due')).toBe('past_due')
    expect(editableStatus('cancel_requested')).toBe('active')
    expect(editableStatus('change_requested')).toBe('active')
    expect(editableStatus('expired')).toBe('expired')
  })
})

describe('updateTenantSubscription — estado de Paddle conservado', () => {
  it('guardar un tenant pausado con status paused no sale del modo degradado ni restaura', async () => {
    const db = fakeDb({ plan: 'growth', status: 'paused', trial_ends_at: null, degraded_at: '2026-11-01T00:00:00.000Z' })
    mockAdmin.mockReturnValue(db.client)
    const res = await updateTenantSubscription({ tenantId: 't1', plan: 'growth', status: 'paused' })
    expect(res).toEqual({ ok: true })
    expect(db.upserts[0]).toMatchObject({ status: 'paused' })
    expect(db.upserts[0]).not.toHaveProperty('degraded_at')
    expect(restoreAfterReactivation).not.toHaveBeenCalled()
    expect(notifyDegradation).not.toHaveBeenCalled()
  })
})

describe('updateTenantSubscription — aviso al entrar en degradado', () => {
  it('active -> cancelled avisa como Paddle', async () => {
    mockAdmin.mockReturnValue(fakeDb({ plan: 'growth', status: 'active', trial_ends_at: null, degraded_at: null }).client)
    await updateTenantSubscription({ tenantId: 't1', plan: 'growth', status: 'cancelled' })
    expect(notifyDegradation).toHaveBeenCalledWith('t1', 'cancelled')
  })

  it('trial -> expired avisa con expired (notifyDegradation omite el correo al cliente)', async () => {
    mockAdmin.mockReturnValue(fakeDb({ plan: 'growth', status: 'trial', trial_ends_at: '2999-01-01T00:00:00.000Z', degraded_at: null }).client)
    await updateTenantSubscription({ tenantId: 't1', plan: 'growth', status: 'expired' })
    expect(notifyDegradation).toHaveBeenCalledWith('t1', 'expired')
  })

  it('un fallo del aviso no rompe el guardado', async () => {
    mockAdmin.mockReturnValue(fakeDb({ plan: 'growth', status: 'active', trial_ends_at: null, degraded_at: null }).client)
    notifyDegradation.mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await updateTenantSubscription({ tenantId: 't1', plan: 'growth', status: 'cancelled' })).toEqual({ ok: true })
    spy.mockRestore()
  })

  it('sin cambio de lado no avisa (active -> active)', async () => {
    mockAdmin.mockReturnValue(fakeDb({ plan: 'growth', status: 'active', trial_ends_at: null, degraded_at: null }).client)
    await updateTenantSubscription({ tenantId: 't1', plan: 'partner', status: 'active' })
    expect(notifyDegradation).not.toHaveBeenCalled()
  })
})
