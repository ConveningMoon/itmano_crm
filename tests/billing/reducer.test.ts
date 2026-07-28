import { describe, it, expect } from 'vitest'
import {
  mapPaddleStatus,
  isDegraded,
  reduceSubscriptionEvent,
  type PaddleSubscriptionEvent,
  type SubscriptionSnapshot,
} from '@/lib/paddle/reducer'

const baseEvent: PaddleSubscriptionEvent = {
  eventId:          'evt_001',
  eventType:        'subscription.created',
  occurredAt:       '2026-08-01T10:00:00.000Z',
  subscriptionId:   'sub_123',
  customerId:       'ctm_123',
  status:           'active',
  priceId:          'pri_growth_month',
  billingCycle:     'month',
  currentPeriodEnd: '2026-09-01T10:00:00.000Z',
  cancelAt:         null,
  customData:       { tenant_id: 'tenant-x' },
}

const fresh: SubscriptionSnapshot = { status: 'trial', lastEventAt: null, degradedAt: null }

describe('mapPaddleStatus', () => {
  it('trialing y active dan acceso completo', () => {
    expect(mapPaddleStatus('trialing')).toBe('active')
    expect(mapPaddleStatus('active')).toBe('active')
  })

  it('mapea los estados de impago', () => {
    expect(mapPaddleStatus('past_due')).toBe('past_due')
    expect(mapPaddleStatus('paused')).toBe('paused')
    expect(mapPaddleStatus('canceled')).toBe('cancelled')
  })

  it('fail-open deliberado: un status desconocido da acceso completo', () => {
    // Ante un status crudo que Paddle agregue sin avisar, es preferible dar
    // acceso de más que cortarle el servicio a alguien que paga.
    expect(mapPaddleStatus('algo_inventado')).toBe('active')
  })
})

describe('isDegraded', () => {
  it('past_due NO degrada — la tarjeta puede fallar sin ser impago', () => {
    expect(isDegraded('past_due')).toBe(false)
  })

  it('paused y cancelled degradan', () => {
    expect(isDegraded('paused')).toBe(true)
    expect(isDegraded('cancelled')).toBe(true)
  })

  it('trial y active no degradan', () => {
    expect(isDegraded('trial')).toBe(false)
    expect(isDegraded('active')).toBe(false)
  })
})

describe('reduceSubscriptionEvent', () => {
  it('escribe los identificadores de paddle y limpia el trial', () => {
    const patch = reduceSubscriptionEvent(baseEvent, fresh)!
    expect(patch.paddle_subscription_id).toBe('sub_123')
    expect(patch.paddle_customer_id).toBe('ctm_123')
    expect(patch.paddle_price_id).toBe('pri_growth_month')
    expect(patch.billing_cycle).toBe('month')
    expect(patch.status).toBe('active')
    expect(patch.trial_ends_at).toBeNull()
    expect(patch.last_event_at).toBe('2026-08-01T10:00:00.000Z')
  })

  it('descarta un evento anterior al ultimo aplicado', () => {
    const stale = { ...baseEvent, occurredAt: '2026-07-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null,
    }
    expect(reduceSubscriptionEvent(stale, current)).toBeNull()
  })

  it('descarta un evento con el mismo occurred_at (reentrega)', () => {
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null,
    }
    expect(reduceSubscriptionEvent(baseEvent, current)).toBeNull()
  })

  it('descarta un evento del mismo instante cuando los formatos difieren (Paddle vs Postgres)', () => {
    // Postgres devuelve "2026-08-01 10:00:00.635628+00" (espacio, "+00"),
    // Paddle emite "2026-08-01T10:00:00.635628Z" ('T', 'Z'). Como texto,
    // 'T' (0x54) > ' ' (0x20), así que la comparación lexicográfica vieja
    // NUNCA filtraba nada. Con Date.parse ambos son el mismo instante → null.
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01 10:00:00.635628+00', degradedAt: null,
    }
    const ev = { ...baseEvent, occurredAt: '2026-08-01T10:00:00.635628Z' }
    expect(reduceSubscriptionEvent(ev, current)).toBeNull()
  })

  it('descarta un evento claramente anterior en formato Paddle contra un snapshot en formato Postgres', () => {
    const current: SubscriptionSnapshot = {
      status: 'active', lastEventAt: '2026-08-01 10:00:00.000000+00', degradedAt: null,
    }
    const ev = { ...baseEvent, occurredAt: '2026-07-01T00:00:00.000Z' }
    expect(reduceSubscriptionEvent(ev, current)).toBeNull()
  })

  it('marca degraded_at al pasar a cancelled', () => {
    const ev = { ...baseEvent, eventType: 'subscription.canceled', status: 'canceled', occurredAt: '2026-09-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = { status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('cancelled')
    expect(patch.degraded_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('no reinicia degraded_at si ya estaba degradado', () => {
    const ev = { ...baseEvent, status: 'paused', occurredAt: '2026-10-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'cancelled', lastEventAt: '2026-09-01T00:00:00.000Z', degradedAt: '2026-09-01T00:00:00.000Z',
    }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.degraded_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('limpia degraded_at al reactivar', () => {
    const ev = { ...baseEvent, status: 'active', occurredAt: '2026-11-01T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'cancelled', lastEventAt: '2026-10-01T00:00:00.000Z', degradedAt: '2026-09-01T00:00:00.000Z',
    }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('active')
    expect(patch.degraded_at).toBeNull()
  })

  it('past_due estando ya degradado NO reinicia el ancla de degraded_at', () => {
    // past_due es un reintento de cobro, no una vuelta al buen estado. Solo un
    // 'active' real debe limpiar degraded_at.
    const ev = { ...baseEvent, status: 'past_due', occurredAt: '2026-10-15T00:00:00.000Z' }
    const current: SubscriptionSnapshot = {
      status: 'paused', lastEventAt: '2026-10-01T00:00:00.000Z', degradedAt: '2026-09-01T00:00:00.000Z',
    }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('past_due')
    expect(patch.degraded_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('escribe plan cuando custom_data lo trae con un valor valido', () => {
    const ev = { ...baseEvent, customData: { tenant_id: 'tenant-x', plan: 'growth' } }
    const patch = reduceSubscriptionEvent(ev, fresh)!
    expect(patch.plan).toBe('growth')
  })

  it('no escribe la clave plan si custom_data no lo trae', () => {
    const patch = reduceSubscriptionEvent(baseEvent, fresh)!
    expect('plan' in patch).toBe(false)
  })

  it('no escribe la clave plan si custom_data trae un valor invalido', () => {
    const ev = { ...baseEvent, customData: { tenant_id: 'tenant-x', plan: 'basura' } }
    const patch = reduceSubscriptionEvent(ev, fresh)!
    expect('plan' in patch).toBe(false)
  })

  it('LA TRAMPA: cancelar un anual NO degrada mientras el periodo siga pagado', () => {
    // Paddle deja status=active con un scheduled_change a fin de periodo.
    // Degradar aqui le cortaria el servicio a alguien que ya pago 12 meses.
    const ev: PaddleSubscriptionEvent = {
      ...baseEvent,
      eventType:        'subscription.updated',
      occurredAt:       '2026-09-01T00:00:00.000Z',
      status:           'active',
      billingCycle:     'year',
      cancelAt:         '2027-08-01T10:00:00.000Z',
      currentPeriodEnd: '2027-08-01T10:00:00.000Z',
    }
    const current: SubscriptionSnapshot = { status: 'active', lastEventAt: '2026-08-01T10:00:00.000Z', degradedAt: null }
    const patch = reduceSubscriptionEvent(ev, current)!
    expect(patch.status).toBe('active')
    expect(patch.degraded_at).toBeNull()
    expect(patch.cancel_at).toBe('2027-08-01T10:00:00.000Z')
  })
})
