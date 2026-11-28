import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn()
let status = 'expired'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({
  getCurrentTenantContext: vi.fn(async () => ({
    user_id: 'u', email: 'u@example.com', role: 'agent_owner', tenant_id: 't1', agent_id: null, acting_as_tenant: false,
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b, eq: () => b,
        update: (p: unknown) => { update(p); return b },
        maybeSingle: () => Promise.resolve({ data: { plan: 'growth', status } }),
      }
      return b
    },
  }),
}))

import { requestSubscriptionChange, requestSubscriptionCancel } from '@/app/(dashboard)/settings/actions'

beforeEach(() => { update.mockReset() })

describe('solicitudes comerciales de trial/expired', () => {
  for (const s of ['trial', 'expired']) {
    it(`rechazan ${s} sin escribir en la base`, async () => {
      status = s
      const change = await requestSubscriptionChange('esencial')
      const cancel = await requestSubscriptionCancel()
      expect(change.ok).toBe(false)
      expect(cancel.ok).toBe(false)
      if (!change.ok) expect(change.error).toMatch(/Activa tu plan con pago/)
      expect(update).not.toHaveBeenCalled()
    })
  }
})
