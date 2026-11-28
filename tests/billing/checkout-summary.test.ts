import { describe, expect, it } from 'vitest'
import type { CheckoutEventsTimePeriod } from '@paddle/paddle-js'
import {
  buildOrderSummary, cycleLabel, formatCheckoutAmount, renewalEvery, type CheckoutSummaryInput,
} from '@/lib/paddle/checkout-summary'

// Resumen propio del checkout inline (/pago). Paddle exige que el sitio muestre
// totales con moneda y lo que se cobra en cada renovación: si esto se equivoca,
// el cliente ve un importe distinto del que se le cobra.

const period = (interval: string, frequency = 1) =>
  ({ interval, frequency }) as CheckoutEventsTimePeriod

const totals = (subtotal: number, tax: number, extra: Partial<{ discount: number; credit: number; balance: number }> = {}) => ({
  subtotal, tax, discount: 0, total: subtotal + tax - (extra.discount ?? 0), ...extra,
})

function item(name: string, subtotal: number, quantity = 1, cycle = period('month')) {
  return {
    price_id: `pri_${name}`,
    product:  { id: `pro_${name}`, name },
    quantity,
    billing_cycle: cycle,
    totals: totals(subtotal, 0),
    recurring_totals: totals(subtotal, 0),
  }
}

describe('formato de importes de Paddle.js', () => {
  it('usa unidades mayores, no centavos', () => {
    expect(formatCheckoutAmount(249, 'USD')).toBe('$249.00')
    expect(formatCheckoutAmount(1290, 'USD')).toBe('$1,290.00')
    expect(formatCheckoutAmount(5.32, 'USD')).toBe('$5.32')
  })

  it('respeta los decimales de cada moneda', () => {
    expect(formatCheckoutAmount(1500, 'JPY')).toBe('¥1,500')
  })
})

describe('ciclo de cobro', () => {
  it('nombra los ciclos habituales y los múltiplos', () => {
    expect(cycleLabel(period('month'))).toBe('Mensual')
    expect(cycleLabel(period('year'))).toBe('Anual')
    expect(cycleLabel(period('month', 3))).toBe('Cada 3 meses')
    expect(renewalEvery(period('month'))).toBe('cada mes')
    expect(renewalEvery(period('year'))).toBe('cada año')
    expect(renewalEvery(period('week', 2))).toBe('cada 2 semanas')
  })
})

describe('resumen del pedido', () => {
  it('Esencial mensual: una línea, impuestos, total de hoy y renovación con moneda', () => {
    const data = {
      currency_code: 'USD',
      items: [item('Esencial', 59)],
      totals: totals(59, 4.13),
      recurring_totals: totals(59, 4.13),
    } as CheckoutSummaryInput

    const s = buildOrderSummary(data)
    expect(s.lines).toEqual([
      { key: 'pri_Esencial-0', name: 'Esencial', detail: 'Mensual', quantity: 1, amount: '$59.00' },
    ])
    expect(s.subtotal).toBe('$59.00')
    expect(s.tax).toBe('$4.13')
    expect(s.discount).toBeNull()
    expect(s.credit).toBeNull()
    expect(s.dueToday).toBe('$63.13 USD')
    expect(s.renewal).toEqual({ amount: '$63.13 USD', every: 'cada mes' })
  })

  it('Partner anual con 2 logins adicionales: dos líneas y precio unitario del asiento', () => {
    const year = period('year')
    const data = {
      currency_code: 'USD',
      items: [item('Partner', 2490, 1, year), item('Login adicional Partner', 980, 2, year)],
      totals: totals(3470, 0),
      recurring_totals: totals(3470, 0),
    } as CheckoutSummaryInput

    const s = buildOrderSummary(data)
    expect(s.lines.map(l => [l.name, l.detail, l.amount])).toEqual([
      ['Partner', 'Anual', '$2,490.00'],
      ['Login adicional Partner', 'Anual · 2 × $490.00', '$980.00'],
    ])
    expect(s.dueToday).toBe('$3,470.00 USD')
    expect(s.renewal).toEqual({ amount: '$3,470.00 USD', every: 'cada año' })
  })

  it('descuento y crédito: el total de hoy es el saldo pendiente', () => {
    const data = {
      currency_code: 'USD',
      items: [item('Growth', 129)],
      totals: totals(129, 0, { discount: 29, credit: 20, balance: 80 }),
      recurring_totals: totals(129, 0),
    } as CheckoutSummaryInput

    const s = buildOrderSummary(data)
    expect(s.discount).toBe('$29.00')
    expect(s.credit).toBe('$20.00')
    expect(s.dueToday).toBe('$80.00 USD')
    expect(s.renewal?.amount).toBe('$129.00 USD')
  })

  it('sin ítems recurrentes no promete renovación', () => {
    const data = {
      currency_code: 'USD',
      items: [{ ...item('Configuración', 100), billing_cycle: undefined, recurring_totals: undefined }],
      totals: totals(100, 0),
    } as CheckoutSummaryInput

    const s = buildOrderSummary(data)
    expect(s.lines[0].detail).toBeNull()
    expect(s.renewal).toBeNull()
  })
})
