import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getAiLimitStatus, assertAiWithinLimit } from '@/lib/services/ai-limit'
import { computeCostUsd } from '@/lib/services/ai-usage'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Suite de integración del límite mensual de IA. Corre contra la DB remota
// (igual que tests/rls) con un tenant temporal que se limpia al final.
// npm run test:ai-limits

// Node < 22 no trae WebSocket nativo; ws como transporte (mismo patrón que
// tests/rls/setup.ts). El polyfill global cubre el createAdminClient() interno
// de los servicios bajo prueba.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? ws

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } },
)

const TENANT_ID = 'tenant-test-ailimit'
// El tope del fixture. La reserva del núcleo declarada en plans.ts ($2 en
// Esencial) es enorme comparada con esto, así que SIEMPRE la recorta el tope de
// seguridad de ai-budget.ts: reserva = 50% del tope, discrecional = la otra
// mitad. Con $0.10 las dos fronteras caen en números redondos ($0.05 y $0.10).
const LIMIT_USD = 0.10
const DISCRECIONAL_USD = LIMIT_USD / 2

const ownerCtx: TenantContext = {
  user_id: '00000000-0000-4000-8000-00000000a1a1',
  email: 'owner@test.itmano.com',
  role: 'agent_owner',
  tenant_id: TENANT_ID,
  agent_id: null,
  acting_as_tenant: false,
}

const superCtx: TenantContext = {
  user_id: '00000000-0000-4000-8000-00000000a2a2',
  email: 'super@test.itmano.com',
  role: 'super_admin',
  tenant_id: TENANT_ID, // actuando como el tenant
  agent_id: null,
  acting_as_tenant: true,
}

async function insertUsage(costUsd: number, createdAt?: string) {
  const { error } = await admin.from('ai_usage_events').insert({
    tenant_id: TENANT_ID,
    feature: 'email_draft',
    model: 'claude-sonnet-5',
    input_tokens: 1000,
    output_tokens: 500,
    cost_usd: costUsd,
    ...(createdAt ? { created_at: createdAt } : {}),
  })
  if (error) throw new Error(`insertUsage failed: ${error.message}`)
}

async function setTenantLimit(limitUsd: number, unlimited: boolean) {
  const { error } = await admin
    .from('tenants')
    .update({ ai_monthly_limit_usd: limitUsd, ai_unlimited: unlimited })
    .eq('id', TENANT_ID)
  if (error) throw new Error(`setTenantLimit failed: ${error.message}`)
}

beforeAll(async () => {
  // Tenant temporal aislado (sin leads/usuarios) solo para este suite.
  const { error } = await admin.from('tenants').insert({
    id: TENANT_ID,
    name: 'AI Limit Test Tenant',
    slug: 'test-ailimit',
    primary_color: '#123456',
    ai_monthly_limit_usd: LIMIT_USD,
    ai_unlimited: false,
  })
  if (error) throw new Error(`fixture tenant insert failed: ${error.message}`)
})

afterAll(async () => {
  await admin.from('ai_usage_events').delete().eq('tenant_id', TENANT_ID)
  await admin.from('tenants').delete().eq('id', TENANT_ID)
})

describe('AI monthly limit', () => {
  it('sin uso: no bloquea y permite generar', async () => {
    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.unlimited).toBe(false)
    expect(status.limitUsd).toBeCloseTo(LIMIT_USD, 6)
    expect(status.usedUsd).toBe(0)
    expect(status.blocked).toBe(false)
    expect(status.blockedDiscretionary).toBe(false)

    expect(await assertAiWithinLimit(ownerCtx, 'email_draft')).toBeNull()
  })

  // El fixture no tiene fila en `subscriptions`. Que caiga a 'esencial' —la
  // reserva más pequeña— es deliberado: ante la duda no se le quita
  // presupuesto discrecional a un tenant del que no sabemos el plan.
  it('un tenant sin suscripción cae al plan de reserva más pequeña', async () => {
    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.plan).toBe('esencial')
    expect(status.reserveUsd).toBeCloseTo(DISCRECIONAL_USD, 6)
    expect(status.discretionaryLimitUsd).toBeCloseTo(DISCRECIONAL_USD, 6)
  })

  it('con uso por debajo del tramo discrecional: sigue permitiendo', async () => {
    await insertUsage(0.03) // 0.03 < 0.05

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.usedUsd).toBeCloseTo(0.03, 6)
    expect(status.blocked).toBe(false)
    expect(status.blockedDiscretionary).toBe(false)
    // El ratio se mide contra el DISCRECIONAL: es el número que ve el usuario y
    // tiene que llegar a 100% justo cuando la UI deja de dejarle generar.
    expect(status.usedRatio).toBeCloseTo(0.03 / DISCRECIONAL_USD, 4)

    expect(await assertAiWithinLimit(ownerCtx, 'email_draft')).toBeNull()
  })

  // El corazón del cambio: agotado lo que se pulsa a mano, el análisis
  // automático de leads TODAVÍA tiene con qué correr.
  it('agotado lo discrecional: se corta lo manual y el núcleo sigue', async () => {
    await insertUsage(0.03) // total 0.06 ≥ 0.05, pero < 0.10

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.usedUsd).toBeCloseTo(0.06, 6)
    expect(status.blockedDiscretionary).toBe(true)
    expect(status.blocked).toBe(false)
    expect(status.usedRatio).toBe(1) // acotado a 1

    const denial = await assertAiWithinLimit(ownerCtx, 'email_draft')
    expect(denial).not.toBeNull()
    expect(denial!.ok).toBe(false)
    expect(denial!.error).toContain('límite mensual')
    // Le dice al usuario por qué la UI marca 100% pero sus leads se siguen
    // analizando; sin esto, "alcanzaste el límite" parece un error.
    expect(denial!.error).toContain('reservado')
    // El monto en USD es interno de ITMANO — el mensaje no debe revelarlo.
    expect(denial!.error).not.toContain('$')

    // Lo mismo que consulta ai-lead-fit.ts antes de analizar un lead.
    expect(status.blocked).toBe(false)
    expect(await assertAiWithinLimit(ownerCtx, 'lead_fit')).toBeNull()
  })

  it('el rol agent también queda bloqueado en lo discrecional', async () => {
    const agentCtx: TenantContext = { ...ownerCtx, role: 'agent', agent_id: 'agent-test' }
    expect(await assertAiWithinLimit(agentCtx, 'email_draft')).not.toBeNull()
    expect(await assertAiWithinLimit(agentCtx, 'lead_fit')).toBeNull()
  })

  it('al agotar el tope entero se corta también el núcleo', async () => {
    await insertUsage(0.05) // total 0.11 ≥ 0.10

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.usedUsd).toBeCloseTo(0.11, 6)
    expect(status.blocked).toBe(true)

    const denial = await assertAiWithinLimit(ownerCtx, 'lead_fit')
    expect(denial).not.toBeNull()
    expect(denial!.error).not.toContain('$')
  })

  it('super_admin pasa siempre, incluso con el tenant bloqueado', async () => {
    expect(await assertAiWithinLimit(superCtx, 'email_draft')).toBeNull()
  })

  it('acceso ilimitado: nunca bloquea aunque exceda el monto', async () => {
    await setTenantLimit(LIMIT_USD, true)

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.unlimited).toBe(true)
    expect(status.blocked).toBe(false)
    expect(status.blockedDiscretionary).toBe(false)
    // Sin escasez no hay nada que reservar: el tramo discrecional es el tope.
    expect(status.reserveUsd).toBe(0)
    expect(await assertAiWithinLimit(ownerCtx, 'email_draft')).toBeNull()

    await setTenantLimit(LIMIT_USD, false) // restaurar
  })

  it('subir el límite manualmente desbloquea (control del admin)', async () => {
    await setTenantLimit(1.0, false)

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.blocked).toBe(false)
    expect(status.blockedDiscretionary).toBe(false)
    expect(await assertAiWithinLimit(ownerCtx, 'email_draft')).toBeNull()

    await setTenantLimit(LIMIT_USD, false) // restaurar → vuelve a bloquear
    const again = await getAiLimitStatus(TENANT_ID)
    expect(again.blocked).toBe(true)
  })

  it('el gasto de meses anteriores NO cuenta para el mes en curso', async () => {
    // Mes pasado, monto enorme — no debe afectar el corte mensual.
    const lastMonth = new Date()
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 15)
    await insertUsage(100, lastMonth.toISOString())

    const status = await getAiLimitStatus(TENANT_ID)
    // Solo los 0.11 de este mes.
    expect(status.usedUsd).toBeCloseTo(0.11, 6)
  })

  it('computeCostUsd usa la tarifa correcta de claude-sonnet-5', () => {
    // 1M tokens de entrada = $3; 1M de salida = $15.
    expect(computeCostUsd('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(3, 6)
    expect(computeCostUsd('claude-sonnet-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(15, 6)
    // Caso real: intake de propiedad (~6k in / 800 out) ≈ 3 centavos.
    expect(computeCostUsd('claude-sonnet-5', { input_tokens: 6000, output_tokens: 800 })).toBeCloseTo(0.03, 3)
    // Modelo desconocido cae a tarifa sonnet (nunca costo 0).
    expect(computeCostUsd('modelo-desconocido', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(3, 6)
  })
})
