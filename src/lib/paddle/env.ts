import 'server-only'
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { CatalogPrices } from '@/lib/paddle/items'

// Único punto donde se leen las credenciales de Paddle. Sandbox y Live son
// cuentas SEPARADAS: distintos IDs de precio, keys y client tokens. Por eso los
// price IDs viven en variables de entorno — el go-live no toca código.

export type BillingCycle = 'month' | 'year'

export function paddleEnvironment(): 'sandbox' | 'production' {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox'
}

let cached: Paddle | null = null

export function getPaddle(): Paddle {
  if (cached) return cached
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) throw new Error('PADDLE_API_KEY no está configurada')
  cached = new Paddle(apiKey, {
    environment: paddleEnvironment() === 'production' ? Environment.production : Environment.sandbox,
  })
  return cached
}

// Catálogo (fase 5 del plan SaaS, D3): Partner también tiene precio de
// catálogo, más un precio por asiento (login extra) que se cobra como cantidad.
// Un precio negociado para un Partner sigue siendo posible como excepción: lo
// fija ITMANO en subscriptions.paddle_price_id antes del primer pago.
const PRICE_ENV: Record<SubscriptionPlan, Record<BillingCycle, string>> = {
  esencial: { month: 'PADDLE_PRICE_ESENCIAL_MONTH', year: 'PADDLE_PRICE_ESENCIAL_YEAR' },
  growth:   { month: 'PADDLE_PRICE_GROWTH_MONTH',   year: 'PADDLE_PRICE_GROWTH_YEAR'   },
  partner:  { month: 'PADDLE_PRICE_PARTNER_MONTH',  year: 'PADDLE_PRICE_PARTNER_YEAR'  },
}
const SEAT_ENV: Record<BillingCycle, string> = {
  month: 'PADDLE_PRICE_PARTNER_SEAT_MONTH',
  year:  'PADDLE_PRICE_PARTNER_SEAT_YEAR',
}

const envValue = (name: string): string | null => process.env[name]?.trim() || null

/** Los price IDs del catálogo tal como estén configurados (null = falta la variable). */
export function catalogPrices(): CatalogPrices {
  const plans = {} as CatalogPrices['plans']
  for (const plan of Object.keys(PRICE_ENV) as SubscriptionPlan[]) {
    plans[plan] = { month: envValue(PRICE_ENV[plan].month), year: envValue(PRICE_ENV[plan].year) }
  }
  return { plans, seat: { month: envValue(SEAT_ENV.month), year: envValue(SEAT_ENV.year) } }
}

export function resolveStandardPriceId(plan: SubscriptionPlan, cycle: BillingCycle): string | null {
  return catalogPrices().plans[plan][cycle]
}
