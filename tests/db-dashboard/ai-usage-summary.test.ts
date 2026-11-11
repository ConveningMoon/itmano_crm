import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// RPC ai_usage_summary contra el sandbox, con un tenant temporal que se limpia
// al final. Sólo filas en ai_usage_events: no llama a ningún proveedor de IA.
//
//   npm run test:dashboard

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? ws

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } },
)

const TENANT  = 'tenant-test-ai-summary'
const AGENT_A = 'agent-test-ai-sum-a'
const AGENT_B = 'agent-test-ai-sum-b'

interface Totals { requests: number; inputTokens: number; outputTokens: number; costUsd: number }
interface Summary {
  allTime: Totals
  last30d: Totals
  byFeature: (Totals & { feature: string })[]
  byTenant: (Totals & { tenantId: string | null })[] | null
  byMonth: { key: string; requests: number; costUsd: number }[]
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

async function cleanup() {
  await admin.from('ai_usage_events').delete().eq('tenant_id', TENANT)
  await admin.from('agents').delete().eq('tenant_id', TENANT)
  await admin.from('tenants').delete().eq('id', TENANT)
}

async function summary(tenant: string | null, agent: string | null = null): Promise<Summary> {
  return must(
    await admin.rpc('ai_usage_summary', { p_tenant_id: tenant, p_agent_id: agent, p_months: 6 }),
    'ai_usage_summary',
  ) as Summary
}

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const monthKey = (iso: string) => iso.slice(0, 7)

// 1200 eventos viejos (más que el tope de 1000 filas de la Data API) más tres
// recientes; el conteo histórico sólo cuadra si se agrega en la base.
const OLD = 1200
const OLD_AT = ago(400)

beforeAll(async () => {
  await cleanup()
  must(await admin.from('tenants').insert({ id: TENANT, name: 'AI Summary Test', slug: TENANT, currency: 'USD' }), 'tenant')
  must(await admin.from('agents').insert([
    { id: AGENT_A, tenant_id: TENANT, name: 'Agente A', email: 'a@example.com', language: 'es', languages: ['es'], avatar_initials: 'AA', accent_color: '#888888' },
    { id: AGENT_B, tenant_id: TENANT, name: 'Agente B', email: 'b@example.com', language: 'es', languages: ['es'], avatar_initials: 'AB', accent_color: '#888888' },
  ]), 'agents')

  const base = { tenant_id: TENANT, model: 'test-model' }
  const old = Array.from({ length: OLD }, () => ({
    ...base, agent_id: AGENT_A, feature: 'email_draft', input_tokens: 1, output_tokens: 2, cost_usd: 0.001, created_at: OLD_AT,
  }))
  for (let i = 0; i < old.length; i += 500) {
    must(await admin.from('ai_usage_events').insert(old.slice(i, i + 500)), 'old events')
  }
  must(await admin.from('ai_usage_events').insert([
    { ...base, agent_id: AGENT_A, feature: 'email_draft',     input_tokens: 10, output_tokens: 20, cost_usd: 0.25, created_at: ago(1) },
    { ...base, agent_id: AGENT_B, feature: 'property_intake', input_tokens: 30, output_tokens: 40, cost_usd: 0.5,  created_at: ago(2) },
    { ...base, agent_id: AGENT_B, feature: 'property_intake', input_tokens: 5,  output_tokens: 5,  cost_usd: 0.125, created_at: ago(45) },
  ]), 'recent events')
}, 60_000)

afterAll(cleanup)

describe('ai_usage_summary', () => {
  it('agrega todo el histórico aunque supere las 1000 filas', async () => {
    const s = await summary(TENANT)
    expect(s.allTime.requests).toBe(OLD + 3)
    expect(s.allTime.inputTokens).toBe(OLD * 1 + 45)
    expect(s.allTime.outputTokens).toBe(OLD * 2 + 65)
    expect(Number(s.allTime.costUsd)).toBeCloseTo(OLD * 0.001 + 0.875, 6)
  })

  it('last30d sólo cuenta los últimos 30 días', async () => {
    const s = await summary(TENANT)
    expect(s.last30d.requests).toBe(2)
    expect(Number(s.last30d.costUsd)).toBeCloseTo(0.75, 6)
  })

  it('byFeature ordena por costo y byTenant es null con tenant', async () => {
    const s = await summary(TENANT)
    expect(s.byFeature.map(f => f.feature)).toEqual(['email_draft', 'property_intake'])
    expect(s.byFeature[0].requests).toBe(OLD + 1)
    expect(s.byTenant).toBeNull()
  })

  it('byMonth sólo trae meses de la ventana con uso', async () => {
    const s = await summary(TENANT)
    const keys = s.byMonth.map(m => m.key)
    expect(keys).not.toContain(monthKey(OLD_AT))
    expect(keys).toContain(monthKey(ago(1)))
    expect(s.byMonth.reduce((n, m) => n + m.requests, 0)).toBe(3)
  })

  it('p_agent_id filtra a los requests de ese agente', async () => {
    const s = await summary(TENANT, AGENT_B)
    expect(s.allTime.requests).toBe(2)
    expect(s.byFeature.map(f => f.feature)).toEqual(['property_intake'])
  })

  it('sin tenant devuelve el desglose por tenant', async () => {
    const s = await summary(null)
    const mine = s.byTenant?.find(t => t.tenantId === TENANT)
    expect(mine?.requests).toBe(OLD + 3)
  })

  it('anon y authenticated no pueden ejecutarla', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws },
    })
    const { error } = await anon.rpc('ai_usage_summary', { p_tenant_id: TENANT, p_agent_id: null, p_months: 6 })
    expect(error).not.toBeNull()
  })
})
