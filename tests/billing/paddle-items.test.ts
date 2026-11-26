import { describe, expect, it } from 'vitest'
import {
  extraSeats, formatPaddleAmount, isCatalogPrice, negotiatedPartnerPrice, planOfPrice, primaryPriceId,
  reconcileItems, subscriptionItems, type CatalogPrices,
} from '@/lib/paddle/items'
import {
  billingMode, cancelBlock, planChangeBlock, resumeBlock, SELF_SERVICE_MESSAGES, type BillingRow,
} from '@/lib/paddle/self-service'
import { checkoutPlans } from '@/lib/subscriptions'

// Fase 5 del plan SaaS: Partner de catálogo con asientos (D3) y autoservicio
// de la suscripción. Un ítem mal armado cobra de más o de menos de verdad.

const PRICES: CatalogPrices = {
  plans: {
    esencial: { month: 'pri_es_m', year: 'pri_es_y' },
    growth:   { month: 'pri_gr_m', year: 'pri_gr_y' },
    partner:  { month: 'pri_pa_m', year: 'pri_pa_y' },
  },
  seat: { month: 'pri_seat_m', year: 'pri_seat_y' },
}

describe('ítems de la suscripción', () => {
  it('los logins incluidos en Partner no cobran asiento', () => {
    expect(extraSeats(0)).toBe(0)
    expect(extraSeats(3)).toBe(0)
    expect(extraSeats(5)).toBe(2)
  })

  it('Esencial y Growth: un solo ítem del ciclo pedido, sin asientos', () => {
    expect(subscriptionItems({ plan: 'growth', cycle: 'year', logins: 9, prices: PRICES }))
      .toEqual({ ok: true, items: [{ priceId: 'pri_gr_y', quantity: 1 }] })
  })

  it('Partner: base + asientos por login extra, y sin ítem de asiento si no hay extra', () => {
    expect(subscriptionItems({ plan: 'partner', cycle: 'month', logins: 5, prices: PRICES })).toEqual({
      ok: true, items: [{ priceId: 'pri_pa_m', quantity: 1 }, { priceId: 'pri_seat_m', quantity: 2 }],
    })
    expect(subscriptionItems({ plan: 'partner', cycle: 'month', logins: 3, prices: PRICES }))
      .toEqual({ ok: true, items: [{ priceId: 'pri_pa_m', quantity: 1 }] })
  })

  it('un Partner con precio negociado es un solo ítem y no cobra asientos', () => {
    expect(subscriptionItems({ plan: 'partner', cycle: 'month', logins: 8, prices: PRICES, negotiatedPriceId: 'pri_trato' }))
      .toEqual({ ok: true, items: [{ priceId: 'pri_trato', quantity: 1 }] })
  })

  it('una variable de precio que falta no se tapa con otro precio', () => {
    const sinPartner = { ...PRICES, plans: { ...PRICES.plans, partner: { month: null, year: null } } }
    expect(subscriptionItems({ plan: 'partner', cycle: 'month', logins: 1, prices: sinPartner })).toEqual({ ok: false, reason: 'missing_price' })
    const sinAsiento = { ...PRICES, seat: { month: null, year: null } }
    expect(subscriptionItems({ plan: 'partner', cycle: 'month', logins: 4, prices: sinAsiento })).toEqual({ ok: false, reason: 'missing_seat_price' })
  })
})

describe('precios del webhook', () => {
  it('el precio que identifica la suscripción no es el del asiento, venga en el orden que venga', () => {
    expect(primaryPriceId(['pri_seat_m', 'pri_pa_m'], PRICES)).toBe('pri_pa_m')
    expect(primaryPriceId(['pri_pa_m', 'pri_seat_m'], PRICES)).toBe('pri_pa_m')
    expect(primaryPriceId([], PRICES)).toBeNull()
  })

  it('el plan sale del precio de catálogo', () => {
    expect(planOfPrice('pri_gr_y', PRICES)).toEqual({ plan: 'growth', cycle: 'year' })
    expect(planOfPrice('pri_trato', PRICES)).toBeNull()
  })

  it('sólo un precio fuera del catálogo cuenta como negociado', () => {
    expect(negotiatedPartnerPrice('partner', 'pri_trato', PRICES)).toBe('pri_trato')
    expect(negotiatedPartnerPrice('partner', 'pri_pa_m', PRICES)).toBeNull()
    expect(negotiatedPartnerPrice('growth', 'pri_trato', PRICES)).toBeNull()
    expect(isCatalogPrice('pri_seat_y', PRICES)).toBe(true)
  })

  it('formatea los centavos de Paddle', () => {
    expect(formatPaddleAmount('12900', 'USD')).toBe('$129.00')
    expect(formatPaddleAmount(123456, 'USD')).toBe('$1,234.56')
  })
})

const row = (over: Partial<BillingRow> = {}): BillingRow => ({
  plan: 'esencial', status: 'active', billingExempt: false, billingCycle: 'month',
  paddleSubscriptionId: 'sub_1', cancelAt: null, negotiatedPriceId: null, ...over,
})

describe('autoservicio de la suscripción', () => {
  it('con suscripción viva en Paddle puede cambiar de plan o de ciclo', () => {
    expect(planChangeBlock(row(), 'growth', 'month')).toBeNull()
    expect(planChangeBlock(row(), 'esencial', 'year')).toBeNull()
    expect(planChangeBlock(row(), 'esencial', 'month')).toBe(SELF_SERVICE_MESSAGES.samePlan)
  })

  it('no cambia de plan exento, sin Paddle, con pago fallido, con trato o con cancelación programada', () => {
    expect(planChangeBlock(row({ billingExempt: true }), 'growth', 'month')).toBe(SELF_SERVICE_MESSAGES.exempt)
    expect(planChangeBlock(row({ paddleSubscriptionId: null }), 'growth', 'month')).toBe(SELF_SERVICE_MESSAGES.noPaddle)
    expect(planChangeBlock(row({ status: 'past_due' }), 'growth', 'month')).toBe(SELF_SERVICE_MESSAGES.pastDue)
    expect(planChangeBlock(row({ plan: 'partner', negotiatedPriceId: 'pri_trato' }), 'growth', 'month')).toBe(SELF_SERVICE_MESSAGES.negotiated)
    expect(planChangeBlock(row({ cancelAt: '2026-12-01' }), 'growth', 'month')).toBe(SELF_SERVICE_MESSAGES.cancelling)
  })

  it('cancelar y reactivar', () => {
    expect(cancelBlock(row())).toBeNull()
    expect(cancelBlock(row({ status: 'past_due' }))).toBeNull()
    expect(cancelBlock(row({ cancelAt: '2026-12-01' }))).toBe(SELF_SERVICE_MESSAGES.alreadyCancelling)
    expect(resumeBlock(row())).toBe(SELF_SERVICE_MESSAGES.notCancelling)
    expect(resumeBlock(row({ cancelAt: '2026-12-01' }))).toBeNull()
  })

  it('la tarjeta ofrece autoservicio sólo con suscripción viva y sin trato aparte', () => {
    expect(billingMode(row())).toBe('self_service')
    expect(billingMode(row({ status: 'trial', paddleSubscriptionId: null }))).toBe('request')
    expect(billingMode(row({ billingExempt: true }))).toBe('request')
    expect(billingMode(row({ plan: 'partner', negotiatedPriceId: 'pri_trato' }))).toBe('request')
    // Pausada en Paddle: sólo reanudar (un checkout nuevo crearía otra suscripción).
    expect(billingMode(row({ status: 'paused' }))).toBe('paused')
    expect(billingMode(row({ status: 'paused', paddleSubscriptionId: null }))).toBe('request')
  })

  it('Partner se ofrece en el checkout cuando su catálogo está configurado', () => {
    const trial = { plan: 'esencial' as const, status: 'trial' as const, billingCycle: null, paddlePriceId: null, billingExempt: false }
    expect(checkoutPlans(trial)).toEqual(['esencial', 'growth'])
    expect(checkoutPlans(trial, { partnerCatalog: true })).toEqual(['esencial', 'growth', 'partner'])
  })

  it('una suscripción pausada que sigue en Paddle no ofrece un checkout nuevo', () => {
    const paused = { plan: 'growth' as const, status: 'paused' as const, billingCycle: 'month' as const, paddlePriceId: null, billingExempt: false }
    expect(checkoutPlans({ ...paused, paddleSubscriptionId: 'sub_1' })).toEqual([])
    expect(checkoutPlans({ ...paused, paddleSubscriptionId: null })).toEqual(['esencial', 'growth'])
  })
})

describe('reconciliar ítems de Paddle', () => {
  it('deja cada plan con cantidad 1', () => {
    expect(reconcileItems([{ priceId: 'pri_es_m', quantity: 2 }], { extraSeats: 0, prices: PRICES }))
      .toEqual([{ priceId: 'pri_es_m', quantity: 1 }])
  })

  it('Partner: asientos del ciclo del plan, y nada si ya coincide', () => {
    expect(reconcileItems([{ priceId: 'pri_pa_y', quantity: 1 }], { extraSeats: 2, prices: PRICES }))
      .toEqual([{ priceId: 'pri_pa_y', quantity: 1 }, { priceId: 'pri_seat_y', quantity: 2 }])
    expect(reconcileItems([{ priceId: 'pri_seat_y', quantity: 2 }, { priceId: 'pri_pa_y', quantity: 1 }], { extraSeats: 2, prices: PRICES }))
      .toBeNull()
  })

  it('conserva lo que no es de catálogo y no toca un precio negociado', () => {
    expect(reconcileItems([{ priceId: 'pri_gr_m', quantity: 1 }, { priceId: 'pri_addon', quantity: 3 }], { extraSeats: 0, prices: PRICES }))
      .toBeNull()
    expect(reconcileItems([{ priceId: 'pri_trato', quantity: 1 }], { extraSeats: 4, prices: PRICES })).toBeNull()
  })
})
