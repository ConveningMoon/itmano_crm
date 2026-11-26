import type {
  CheckoutEventsData,
  CheckoutEventsTimePeriod,
} from '@paddle/paddle-js'

// Resumen del pedido de la página /pago (checkout inline de Paddle). El frame
// inline sólo pide los datos del pago: los ítems, los totales y la renovación
// los tiene que mostrar el sitio (requisito de Paddle), y llegan en los eventos
// checkout.loaded y checkout.updated de Paddle.js.
//
// OJO con las unidades: los eventos de Paddle.js traen importes en unidades
// mayores (249 = $249.00), no en centavos como la API (formatPaddleAmount en
// items.ts). Por eso este módulo tiene su propio formateador.

export type CheckoutSummaryInput = Pick<
  CheckoutEventsData,
  'currency_code' | 'items' | 'totals' | 'recurring_totals'
>

export interface OrderSummaryLine {
  key:      string
  name:     string
  /** "Anual" o "Anual · 2 × $490.00". */
  detail:   string | null
  quantity: number
  amount:   string
}

export interface OrderSummary {
  currency: string
  lines:    OrderSummaryLine[]
  subtotal: string
  discount: string | null
  tax:      string
  credit:   string | null
  /** Lo que se cobra al confirmar, con el código de moneda: "$249.00 USD". */
  dueToday: string
  /** Cobro de cada renovación. `null` si nada es recurrente. */
  renewal:  { amount: string; every: string } | null
}

const UNITS: Record<string, [singular: string, plural: string]> = {
  day:   ['día', 'días'],
  week:  ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year:  ['año', 'años'],
}

const ADJECTIVES: Record<string, string> = {
  day: 'Diario', week: 'Semanal', month: 'Mensual', year: 'Anual',
}

/** "$1,290.00" desde un importe en unidades mayores de Paddle.js. */
export function formatCheckoutAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    // Código de moneda que Intl no conoce: mejor el número con su código que nada.
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** "Mensual", "Anual" o "Cada 3 meses". */
export function cycleLabel(period: CheckoutEventsTimePeriod): string {
  const units = UNITS[period.interval]
  if (!units) return ''
  if (period.frequency === 1) return ADJECTIVES[period.interval]
  return `Cada ${period.frequency} ${units[1]}`
}

/** "cada mes", "cada año" o "cada 3 meses". */
export function renewalEvery(period: CheckoutEventsTimePeriod): string {
  const units = UNITS[period.interval]
  if (!units) return ''
  return period.frequency === 1 ? `cada ${units[0]}` : `cada ${period.frequency} ${units[1]}`
}

export function buildOrderSummary(data: CheckoutSummaryInput): OrderSummary {
  const currency = data.currency_code
  const money = (n: number) => formatCheckoutAmount(n, currency)

  const lines: OrderSummaryLine[] = data.items.map((item, i) => {
    const parts: string[] = []
    if (item.billing_cycle) parts.push(cycleLabel(item.billing_cycle))
    if (item.quantity > 1) parts.push(`${item.quantity} × ${money(item.totals.subtotal / item.quantity)}`)
    return {
      key:      `${item.price_id}-${i}`,
      name:     item.product.name,
      detail:   parts.filter(Boolean).join(' · ') || null,
      quantity: item.quantity,
      amount:   money(item.totals.subtotal),
    }
  })

  const t = data.totals
  // `balance` es lo que queda por pagar tras créditos; no siempre viene.
  const due = t.balance ?? t.total

  // La renovación usa el ciclo del primer ítem recurrente. Base y asientos de
  // Partner comparten ciclo: el checkout los arma siempre del mismo.
  const cycle = data.items.find(item => item.billing_cycle)?.billing_cycle
  const recurring = data.recurring_totals

  return {
    currency,
    lines,
    subtotal: money(t.subtotal),
    discount: t.discount > 0 ? money(t.discount) : null,
    tax:      money(t.tax),
    credit:   t.credit && t.credit > 0 ? money(t.credit) : null,
    dueToday: `${money(due)} ${currency}`,
    renewal:  recurring && cycle
      ? { amount: `${money(recurring.total)} ${currency}`, every: renewalEvery(cycle) }
      : null,
  }
}
