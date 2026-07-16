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
const LIMIT_USD = 0.05

const ownerCtx: TenantContext = {
  user_id: '00000000-0000-4000-8000-00000000a1a1',
  role: 'agent_owner',
  tenant_id: TENANT_ID,
  agent_id: null,
  acting_as_tenant: false,
}

const superCtx: TenantContext = {
  user_id: '00000000-0000-4000-8000-00000000a2a2',
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

    expect(await assertAiWithinLimit(ownerCtx)).toBeNull()
  })

  it('con uso por debajo del límite: sigue permitiendo', async () => {
    await insertUsage(0.03)

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.usedUsd).toBeCloseTo(0.03, 6)
    expect(status.blocked).toBe(false)
    expect(status.usedRatio).toBeCloseTo(0.03 / LIMIT_USD, 4)

    expect(await assertAiWithinLimit(ownerCtx)).toBeNull()
  })

  it('al alcanzar el límite: bloquea al owner con mensaje sin montos', async () => {
    await insertUsage(0.03) // total 0.06 ≥ 0.05

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.usedUsd).toBeCloseTo(0.06, 6)
    expect(status.blocked).toBe(true)
    expect(status.usedRatio).toBe(1) // acotado a 1

    const denial = await assertAiWithinLimit(ownerCtx)
    expect(denial).not.toBeNull()
    expect(denial!.ok).toBe(false)
    expect(denial!.error).toContain('límite mensual')
    // El monto en USD es interno de ITMANO — el mensaje no debe revelarlo.
    expect(denial!.error).not.toContain('$')
  })

  it('el rol agent también queda bloqueado', async () => {
    const agentCtx: TenantContext = { ...ownerCtx, role: 'agent', agent_id: 'agent-test' }
    const denial = await assertAiWithinLimit(agentCtx)
    expect(denial).not.toBeNull()
  })

  it('super_admin pasa siempre, incluso con el tenant bloqueado', async () => {
    expect(await assertAiWithinLimit(superCtx)).toBeNull()
  })

  it('acceso ilimitado: nunca bloquea aunque exceda el monto', async () => {
    await setTenantLimit(LIMIT_USD, true)

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.unlimited).toBe(true)
    expect(status.blocked).toBe(false)
    expect(await assertAiWithinLimit(ownerCtx)).toBeNull()

    await setTenantLimit(LIMIT_USD, false) // restaurar
  })

  it('subir el límite manualmente desbloquea (control del admin)', async () => {
    await setTenantLimit(1.0, false)

    const status = await getAiLimitStatus(TENANT_ID)
    expect(status.blocked).toBe(false)
    expect(await assertAiWithinLimit(ownerCtx)).toBeNull()

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
    // Solo los 0.06 de este mes.
    expect(status.usedUsd).toBeCloseTo(0.06, 6)
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
