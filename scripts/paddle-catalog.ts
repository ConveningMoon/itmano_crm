/**
 * Crea el catálogo de ITMANO CRM en Paddle. Versionado a propósito: sandbox y
 * live deben salir idénticos, y un catálogo creado a clics no es auditable.
 *
 *   npx tsx scripts/paddle-catalog.ts --env=sandbox
 *   npx tsx scripts/paddle-catalog.ts --env=live
 *   npx tsx scripts/paddle-catalog.ts --env=live --partner --tenant=tecnocasa --monthly=349 --annual=3490
 *
 * Imprime los price IDs. Hay que pegarlos en .env.local y en Vercel.
 * Tax-exclusive y solo USD (decisiones del spec §3).
 */
import { config as dotenvConfig } from 'dotenv'
import { Paddle, Environment } from '@paddle/paddle-node-sdk'
import { PLANS, ANNUAL_MONTHS_CHARGED } from '../src/lib/plans'

dotenvConfig({ path: '.env.local' })

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit?.split('=')[1]
}
const has = (name: string) => process.argv.includes(`--${name}`)

const env = arg('env') === 'live' ? 'live' : 'sandbox'
const apiKey = process.env.PADDLE_API_KEY
if (!apiKey) throw new Error('PADDLE_API_KEY no está configurada en .env.local')

const paddle = new Paddle(apiKey, {
  environment: env === 'live' ? Environment.production : Environment.sandbox,
})

const usd = (dollars: number) => ({ amount: String(Math.round(dollars * 100)), currencyCode: 'USD' as const })

async function createPlan(name: string, description: string, monthly: number, annual: number) {
  const product = await paddle.products.create({
    name,
    description,
    taxCategory: 'standard',
  })

  const monthPrice = await paddle.prices.create({
    productId:    product.id,
    description:  `${name} — mensual`,
    unitPrice:    usd(monthly),
    billingCycle: { interval: 'month', frequency: 1 },
  })

  const yearPrice = await paddle.prices.create({
    productId:    product.id,
    description:  `${name} — anual (${ANNUAL_MONTHS_CHARGED} meses cobrados)`,
    unitPrice:    usd(annual),
    billingCycle: { interval: 'year', frequency: 1 },
  })

  console.log(`\n${name}`)
  console.log(`  product : ${product.id}`)
  console.log(`  mensual : ${monthPrice.id}  ($${monthly})`)
  console.log(`  anual   : ${yearPrice.id}  ($${annual})`)
  return { product, monthPrice, yearPrice }
}

async function main() {
  console.log(`Creando catálogo en Paddle [${env}]…`)

  if (has('partner')) {
    const tenant  = arg('tenant')
    const monthly = Number(arg('monthly'))
    const annual  = Number(arg('annual'))
    if (!tenant || !monthly || !annual) {
      throw new Error('Uso: --partner --tenant=<id> --monthly=<usd> --annual=<usd>')
    }
    await createPlan(
      `ITMANO CRM — Partner (${tenant})`,
      'Plan Partner a medida. Pegar el price id en subscriptions.paddle_price_id del tenant.',
      monthly,
      annual,
    )
    return
  }

  const e = await createPlan('ITMANO CRM — Esencial', PLANS.esencial.blurb, PLANS.esencial.priceUsd!, PLANS.esencial.priceAnnualUsd)
  const g = await createPlan('ITMANO CRM — Growth',   PLANS.growth.blurb,   PLANS.growth.priceUsd!,   PLANS.growth.priceAnnualUsd)

  console.log('\n─── Pegar en .env.local y en Vercel ───')
  console.log(`PADDLE_PRICE_ESENCIAL_MONTH=${e.monthPrice.id}`)
  console.log(`PADDLE_PRICE_ESENCIAL_YEAR=${e.yearPrice.id}`)
  console.log(`PADDLE_PRICE_GROWTH_MONTH=${g.monthPrice.id}`)
  console.log(`PADDLE_PRICE_GROWTH_YEAR=${g.yearPrice.id}`)
  console.log('\nPartner se crea por trato con --partner (ver cabecera del script).')
}

main().catch(err => { console.error(err); process.exit(1) })
