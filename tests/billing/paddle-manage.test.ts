import { beforeEach, describe, expect, it, vi } from 'vitest'

// Operaciones de autoservicio contra un Paddle y una base simulados: qué se le
// pide a Paddle exactamente (ítems, prorrateo, custom_data) y cuándo no se le
// pide nada.

const state = vi.hoisted(() => ({
  sub:    null as Record<string, unknown> | null,
  logins: 3,
  paddleItems: [] as { price: { id: string }; quantity: number }[],
  calls: [] as { op: string; id: string; body?: unknown }[],
}))

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn() } }))

vi.mock('@/lib/paddle/env', () => ({
  catalogPrices: () => ({
    plans: {
      esencial: { month: 'pri_es_m', year: 'pri_es_y' },
      growth:   { month: 'pri_gr_m', year: 'pri_gr_y' },
      partner:  { month: 'pri_pa_m', year: 'pri_pa_y' },
    },
    seat: { month: 'pri_seat_m', year: 'pri_seat_y' },
  }),
  getPaddle: () => ({
    subscriptions: {
      previewUpdate: async (id: string, body: unknown) => {
        state.calls.push({ op: 'preview', id, body })
        return {
          currencyCode: 'USD',
          updateSummary: { result: { action: 'charge', amount: '4500', currencyCode: 'USD' } },
          recurringTransactionDetails: { totals: { total: '12900' } },
        }
      },
      update: async (id: string, body: unknown) => { state.calls.push({ op: 'update', id, body }); return {} },
      cancel: async (id: string, body: unknown) => { state.calls.push({ op: 'cancel', id, body }); return {} },
      resume: async (id: string, body: unknown) => { state.calls.push({ op: 'resume', id, body }); return {} },
      get:    async (id: string) => { state.calls.push({ op: 'get', id }); return { items: state.paddleItems } },
    },
  }),
}))

// Base mínima: la fila de subscriptions y el conteo de logins.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq:     () => q,
        in:     async () => ({ count: state.logins, error: null }),
        maybeSingle: async () => ({ data: table === 'subscriptions' ? state.sub : null, error: null }),
      }
      return q
    },
  }),
}))

const {
  cancelAtPeriodEnd, changePlan, previewPlanChange, reconcileSubscriptionItems, resumePausedSubscription, resumeSubscription,
} = await import('@/lib/paddle/manage')

const activeSub = (over: Record<string, unknown> = {}) => ({
  plan: 'esencial', status: 'active', billing_exempt: false, billing_cycle: 'month',
  paddle_subscription_id: 'sub_1', paddle_price_id: 'pri_es_m', cancel_at: null, ...over,
})

beforeEach(() => {
  state.sub = activeSub()
  state.logins = 1
  state.paddleItems = []
  state.calls = []
})

describe('cambio de plan', () => {
  it('pide a Paddle el plan nuevo prorrateado y con el plan en custom_data', async () => {
    expect(await changePlan('tenant-1', 'growth', 'year')).toEqual({ ok: true, data: null })
    expect(state.calls).toEqual([{
      op: 'update', id: 'sub_1',
      body: {
        items: [{ priceId: 'pri_gr_y', quantity: 1 }],
        prorationBillingMode: 'prorated_immediately',
        customData: { tenant_id: 'tenant-1', plan: 'growth' },
      },
    }])
  })

  it('subir a Partner con 5 logins cobra 2 asientos', async () => {
    state.logins = 5
    await changePlan('tenant-1', 'partner', 'month')
    expect((state.calls[0].body as { items: unknown }).items).toEqual([
      { priceId: 'pri_pa_m', quantity: 1 }, { priceId: 'pri_seat_m', quantity: 2 },
    ])
  })

  it('la vista previa devuelve importes legibles', async () => {
    expect(await previewPlanChange('tenant-1', 'growth', 'month')).toEqual({
      ok: true, data: { action: 'charge', amount: '$45.00', recurring: '$129.00' },
    })
  })

  it('un bloqueo no llega a Paddle', async () => {
    state.sub = activeSub({ status: 'past_due' })
    const res = await changePlan('tenant-1', 'growth', 'month')
    expect(res.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})

describe('cancelar y reactivar', () => {
  it('cancela al final del período, no de inmediato', async () => {
    await cancelAtPeriodEnd('tenant-1')
    expect(state.calls).toEqual([{ op: 'cancel', id: 'sub_1', body: { effectiveFrom: 'next_billing_period' } }])
  })

  it('reactivar quita la cancelación programada', async () => {
    state.sub = activeSub({ cancel_at: '2026-12-01T00:00:00Z' })
    await resumeSubscription('tenant-1')
    expect(state.calls).toEqual([{ op: 'update', id: 'sub_1', body: { scheduledChange: null } }])
  })
})

describe('asientos de Partner', () => {
  it('ajusta los asientos a los logins extra', async () => {
    state.sub = activeSub({ plan: 'partner', paddle_price_id: 'pri_pa_m' })
    state.logins = 6
    state.paddleItems = [{ price: { id: 'pri_pa_m' }, quantity: 1 }, { price: { id: 'pri_seat_m' }, quantity: 1 }]
    expect(await reconcileSubscriptionItems('tenant-1')).toBe('updated')
    expect(state.calls[1]).toEqual({
      op: 'update', id: 'sub_1',
      body: { items: [{ priceId: 'pri_pa_m', quantity: 1 }, { priceId: 'pri_seat_m', quantity: 3 }], prorationBillingMode: 'prorated_immediately' },
    })
  })

  it('al bajar a los logins incluidos quita el ítem de asiento', async () => {
    state.sub = activeSub({ plan: 'partner', paddle_price_id: 'pri_pa_m' })
    state.logins = 3
    state.paddleItems = [{ price: { id: 'pri_pa_m' }, quantity: 1 }, { price: { id: 'pri_seat_m' }, quantity: 2 }]
    await reconcileSubscriptionItems('tenant-1')
    expect((state.calls[1].body as { items: unknown }).items).toEqual([{ priceId: 'pri_pa_m', quantity: 1 }])
  })

  it('no toca Paddle si ya coincide, ni con un Partner de precio negociado', async () => {
    state.sub = activeSub({ plan: 'partner', paddle_price_id: 'pri_pa_m' })
    state.logins = 4
    state.paddleItems = [{ price: { id: 'pri_pa_m' }, quantity: 1 }, { price: { id: 'pri_seat_m' }, quantity: 1 }]
    expect(await reconcileSubscriptionItems('tenant-1')).toBe('in_sync')

    state.calls = []
    state.sub = activeSub({ plan: 'partner', paddle_price_id: 'pri_trato' })
    expect(await reconcileSubscriptionItems('tenant-1')).toBe('not_applicable')
    expect(state.calls).toEqual([])
  })
})

describe('cantidad del plan', () => {
  it('un plan comprado con cantidad 2 vuelve a 1 en Paddle', async () => {
    state.sub = activeSub({ plan: 'growth', paddle_price_id: 'pri_gr_m' })
    state.paddleItems = [{ price: { id: 'pri_gr_m' }, quantity: 2 }]
    expect(await reconcileSubscriptionItems('tenant-1')).toBe('updated')
    expect(state.calls[1]).toEqual({
      op: 'update', id: 'sub_1',
      body: { items: [{ priceId: 'pri_gr_m', quantity: 1 }], prorationBillingMode: 'prorated_immediately' },
    })
  })

  it('un plan que no es Partner no conserva asientos', async () => {
    state.sub = activeSub({ plan: 'growth', paddle_price_id: 'pri_gr_m' })
    state.paddleItems = [{ price: { id: 'pri_gr_m' }, quantity: 1 }, { price: { id: 'pri_seat_m' }, quantity: 1 }]
    await reconcileSubscriptionItems('tenant-1')
    expect((state.calls[1].body as { items: unknown }).items).toEqual([{ priceId: 'pri_gr_m', quantity: 1 }])
  })
})

describe('suscripción en pausa', () => {
  it('se reanuda en Paddle de inmediato', async () => {
    state.sub = activeSub({ status: 'paused' })
    expect(await resumePausedSubscription('tenant-1')).toEqual({ ok: true, data: null })
    expect(state.calls).toEqual([{ op: 'resume', id: 'sub_1', body: { effectiveFrom: 'immediately' } }])
  })

  it('una suscripción activa no se "reanuda"', async () => {
    const res = await resumePausedSubscription('tenant-1')
    expect(res.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})
