import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const send = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/resend', () => ({ resendForAccount: () => ({ emails: { send: (...a: unknown[]) => send(...a) } }) }))
const inserts: unknown[] = []
const tables: string[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      tables.push(t)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b, eq: () => b, order: () => b, limit: () => b,
        maybeSingle: () => Promise.resolve({ data: { id: 'u1', name: 'Equipo', slug: 'equipo' } }),
        insert: (r: unknown) => { inserts.push(r); return Promise.resolve({ error: null }) },
      }
      return b
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: 'o@example.com' } } }) } },
  }),
}))

import { notifyDegradation } from '@/lib/subscriptions/notify-degradation'

describe('notifyDegradation con expired', () => {
  it('deja el aviso a ITMANO pero no envía el correo de suscripción inactiva', async () => {
    await notifyDegradation('t1', 'expired')
    expect(inserts).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
    expect(tables).not.toContain('user_profiles')
  })
  it('para paused sí envía el correo al cliente', async () => {
    await notifyDegradation('t1', 'paused')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
