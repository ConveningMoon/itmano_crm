import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'

// Al cambiar de plan o reactivar, las secuencias dormidas por cuota se
// reanudan ya (no esperan al mes siguiente). Una renovación normal no.

vi.mock('@/lib/subscriptions/reactivate', () => ({ restoreAfterReactivation: vi.fn() }))
vi.mock('@/lib/subscriptions/notify-degradation', () => ({ notifyDegradation: vi.fn() }))
const resume = vi.fn()
vi.mock('@/lib/subscriptions/quota', () => ({ resumeQuotaPausedRuns: (...a: unknown[]) => resume(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { applySubscriptionEvent } from '@/lib/paddle/persist'

const mockCreate = createAdminClient as unknown as ReturnType<typeof vi.fn>

function fake(row: Record<string, unknown>) {
  return {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
          update: () => ({ eq: (_c: string, v: unknown) => ({ select: () => Promise.resolve({ data: [{ tenant_id: v }], error: null }) }) }),
        }
      }
      if (table === 'tenants') return { update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
      if (table === 'paddle_webhook_events') return { update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
      throw new Error(`tabla no mockeada: ${table}`)
    },
  }
}

function ev(plan: string, status = 'active'): PaddleSubscriptionEvent {
  return {
    eventId: 'evt_1', eventType: 'subscription.updated', occurredAt: '2026-11-01T00:00:00.000Z',
    subscriptionId: 'sub_1', customerId: 'ctm_1', status: status as never, priceId: null,
    billingCycle: null, currentPeriodEnd: null, cancelAt: null, customData: { tenant_id: 'tenant-x', plan },
  }
}

const base = { status: 'active', last_event_at: '2026-10-01T00:00:00.000Z', degraded_at: null, plan: 'esencial' }

beforeEach(() => { resume.mockReset().mockResolvedValue(0); mockCreate.mockReset() })

describe('persist reanuda secuencias dormidas por cuota', () => {
  it('al cambiar de plan', async () => {
    mockCreate.mockReturnValue(fake(base))
    await applySubscriptionEvent(ev('growth'))
    expect(resume).toHaveBeenCalledWith('tenant-x')
  })

  it('al reactivar desde degradado', async () => {
    mockCreate.mockReturnValue(fake({ ...base, status: 'cancelled', degraded_at: '2026-10-15T00:00:00.000Z' }))
    await applySubscriptionEvent(ev('esencial'))
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('con el mismo plan y sin reactivación no lo llama', async () => {
    mockCreate.mockReturnValue(fake(base))
    await applySubscriptionEvent(ev('esencial'))
    expect(resume).not.toHaveBeenCalled()
  })

  it('si falla, no rompe el webhook', async () => {
    resume.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreate.mockReturnValue(fake(base))
    await expect(applySubscriptionEvent(ev('growth'))).resolves.toBe('applied')
  })
})
