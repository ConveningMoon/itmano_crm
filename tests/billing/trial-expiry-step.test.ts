import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/resend', () => ({ resendForAccount: vi.fn() }))
vi.mock('@/lib/subscriptions/notify-degradation', () => ({ notifyDegradation: vi.fn() }))

import { runTrialExpiryStep } from '@/lib/subscriptions/trial-expiry-step'

type Call = { method: string; args: unknown[] }

function makeDb(rows: Record<string, unknown>[], updatedRows: unknown[]) {
  const calls: Call[] = []
  let updating = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select() { calls.push({ method: 'select', args: [] }); return b },
    update(p: unknown) { updating = true; calls.push({ method: 'update', args: [p] }); return b },
    eq(c: string, v: unknown) { calls.push({ method: 'eq', args: [c, v] }); return b },
    lt(c: string, v: unknown) { calls.push({ method: 'lt', args: [c, v] }); return b },
    is(c: string, v: unknown) { calls.push({ method: 'is', args: [c, v] }); return b },
    then(ok: (v: unknown) => unknown) {
      return Promise.resolve({ data: updating ? updatedRows : rows, error: null }).then(ok)
    },
  }
  return { calls, client: { from: () => { updating = false; return b } } }
}

const now = new Date('2026-12-20T12:00:00Z')

describe('runTrialExpiryStep', () => {
  it('filtra trial vencida sin Paddle y no exenta; marca expired con degraded_at = vencimiento y avisa', async () => {
    const db = makeDb([{ tenant_id: 't1', trial_ends_at: '2026-12-18T00:00:00Z', degraded_at: null }], [{ tenant_id: 't1' }])
    const notify = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runTrialExpiryStep(db.client as any, now, vi.fn(), notify as any)
    expect(db.calls).toContainEqual({ method: 'eq', args: ['status', 'trial'] })
    expect(db.calls).toContainEqual({ method: 'lt', args: ['trial_ends_at', now.toISOString()] })
    expect(db.calls).toContainEqual({ method: 'is', args: ['paddle_subscription_id', null] })
    expect(db.calls).toContainEqual({ method: 'eq', args: ['billing_exempt', false] })
    const upd = db.calls.find(c => c.method === 'update')!.args[0] as Record<string, unknown>
    expect(upd.status).toBe('expired')
    expect(upd.degraded_at).toBe('2026-12-18T00:00:00Z')
    expect(notify).toHaveBeenCalledWith('t1', 'expired')
    expect(r.expired).toBe(1)
  })

  it('conserva degraded_at existente', async () => {
    const db = makeDb([{ tenant_id: 't1', trial_ends_at: '2026-12-18T00:00:00Z', degraded_at: '2026-12-10T00:00:00Z' }], [{ tenant_id: 't1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runTrialExpiryStep(db.client as any, now, vi.fn(), vi.fn() as any)
    expect((db.calls.find(c => c.method === 'update')!.args[0] as Record<string, unknown>).degraded_at).toBe('2026-12-10T00:00:00Z')
  })

  it('el update es condicional a status trial y no avisa si otra pasada ya lo cambió', async () => {
    const db = makeDb([{ tenant_id: 't1', trial_ends_at: '2026-12-18T00:00:00Z', degraded_at: null }], [])
    const notify = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runTrialExpiryStep(db.client as any, now, vi.fn(), notify as any)
    const idx = db.calls.findIndex(c => c.method === 'update')
    expect(db.calls.slice(idx).some(c => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'trial')).toBe(true)
    expect(notify).not.toHaveBeenCalled()
    expect(r.expired).toBe(0)
  })

  it('un fallo al avisar se registra y no rompe', async () => {
    const db = makeDb([{ tenant_id: 't1', trial_ends_at: '2026-12-18T00:00:00Z', degraded_at: null }], [{ tenant_id: 't1' }])
    const logError = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runTrialExpiryStep(db.client as any, now, logError, vi.fn().mockRejectedValue(new Error('x')) as any)
    expect(r.expired).toBe(1)
    expect(logError).toHaveBeenCalled()
  })
})
