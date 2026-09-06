import 'server-only'
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
import type { SubscriptionPlan } from '@/lib/subscriptions'

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

// Los precios de Partner son por trato y viven en subscriptions.paddle_price_id,
// no aquí. Esta tabla cubre solo los planes de catálogo estándar.
const STANDARD_PRICE_ENV: Record<'esencial' | 'growth', Record<BillingCycle, string>> = {
  esencial: { month: 'PADDLE_PRICE_ESENCIAL_MONTH', year: 'PADDLE_PRICE_ESENCIAL_YEAR' },
  growth:   { month: 'PADDLE_PRICE_GROWTH_MONTH',   year: 'PADDLE_PRICE_GROWTH_YEAR'   },
}

export function resolveStandardPriceId(plan: SubscriptionPlan, cycle: BillingCycle): string | null {
  if (plan === 'partner') return null
  const varName = STANDARD_PRICE_ENV[plan][cycle]
  return process.env[varName] ?? null
}
