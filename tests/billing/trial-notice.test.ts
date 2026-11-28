import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const send = vi.fn()
vi.mock('@/lib/resend', () => ({ resendForAccount: () => ({ emails: { send: (...a: unknown[]) => send(...a) } }) }))

import { trialNoticeDue } from '@/lib/subscriptions/trial-notice-due'
import { sendTrialNotice } from '@/lib/subscriptions/trial-notice'

const now = new Date('2026-12-20T12:00:00Z')
const plus = (ms: number) => new Date(now.getTime() + ms).toISOString()
const DAY = 86_400_000

describe('trialNoticeDue', () => {
  it('4 días -> null', () => { expect(trialNoticeDue(plus(4 * DAY), now)).toBeNull() })
  it('3 días -> 3d', () => { expect(trialNoticeDue(plus(3 * DAY), now)).toBe('3d') })
  it('vence hoy -> today', () => { expect(trialNoticeDue(plus(-2 * 3_600_000), now)).toBe('today') })
  it('vencida ayer -> null', () => { expect(trialNoticeDue(plus(-1.5 * DAY), now)).toBeNull() })
})

function makeDb(existing: boolean, inserts: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function builder(table: string): any {
    const b = {
      select() { return b }, eq() { return b }, limit() { return b },
      insert(row: unknown) { inserts.push(row); return Promise.resolve({ error: null }) },
      maybeSingle() {
        if (table === 'user_profiles') return Promise.resolve({ data: { id: 'u1' } })
        return Promise.resolve({ data: { name: 'Equipo', slug: 'equipo' } })
      },
      then(ok: (v: unknown) => unknown) {
        return Promise.resolve({ data: existing ? [{ id: 'n1' }] : [], error: null }).then(ok)
      },
    }
    return b
  }
  return {
    from: (t: string) => builder(t),
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: { email: 'owner@example.com' } } }) } },
  }
}

beforeEach(() => { send.mockReset(); send.mockResolvedValue({ error: null }) })

describe('sendTrialNotice', () => {
  it('envía y deja el marcador', async () => {
    const inserts: unknown[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await sendTrialNotice(makeDb(false, inserts) as any, { tenantId: 't1', moment: '3d', trialEndsAt: '2026-12-23T12:00:00Z' })
    expect(r).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe('owner@example.com')
    expect(inserts).toHaveLength(1)
  })
  it('si ya hay marcador no vuelve a enviar', async () => {
    const inserts: unknown[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await sendTrialNotice(makeDb(true, inserts) as any, { tenantId: 't1', moment: '3d', trialEndsAt: '2026-12-23T12:00:00Z' })
    expect(r).toBe('skipped')
    expect(send).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })
})
