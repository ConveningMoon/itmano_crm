import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// RPC lead_score_histogram, newsletter_growth y channel_leads_trend contra el
// sandbox, con un tenant temporal que se limpia al final. Sin Resend ni IA.
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

const TENANT  = 'tenant-test-dash-lect'
const EMPTY_T = 'tenant-test-dash-lect-2'
const AGENT_A = 'agent-test-lect-a'
const AGENT_B = 'agent-test-lect-b'

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

async function cleanup() {
  for (const t of [TENANT, EMPTY_T]) {
    for (const table of ['lead_events', 'leads', 'acquisition_channels', 'agents']) {
      await admin.from(table).delete().eq('tenant_id', t)
    }
    await admin.from('tenants').delete().eq('id', t)
  }
}

const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

let nlChannel = ''
let formChannel = ''
let emptyChannel = ''
let n = 0

async function lead(o: {
  stage?: string; score?: number | null; agent?: string; metadata?: object
  channel?: string | null; createdAt?: string; blocked?: string | null
}) {
  const id = `lect-${++n}-${Date.now()}`
  must(await admin.from('leads').insert({
    id, tenant_id: TENANT, agent_id: o.agent ?? AGENT_A, first_name: id, last_name: 'Test',
    email: `${id}@example.com`, language: 'es', stage: o.stage ?? 'nuevo',
    peak_score: 0, current_score: o.score === undefined ? 0 : o.score,
    metadata: o.metadata ?? {}, acquisition_channel_id: o.channel ?? null,
    created_at: o.createdAt ?? ago(1),
    ...(o.blocked ? { email_blocked: true, email_blocked_reason: o.blocked } : {}),
  }), 'lead')
  return id
}

async function unsubEvent(leadId: string, at: string) {
  must(await admin.from('lead_events').insert({
    tenant_id: TENANT, lead_id: leadId, type: 'email_unsubscribed', description: 'prueba',
    created_at: at, dedup_key: `lect_${leadId}`,
  }), 'event')
}

async function clearLeads() {
  await admin.from('lead_events').delete().eq('tenant_id', TENANT)
  await admin.from('leads').delete().eq('tenant_id', TENANT)
}

beforeAll(async () => {
  await cleanup()
  for (const t of [TENANT, EMPTY_T]) {
    must(await admin.from('tenants').insert({ id: t, name: 'Lect Test', slug: t, currency: 'USD' }), 'tenant')
  }
  must(await admin.from('agents').insert([
    { id: AGENT_A, tenant_id: TENANT, name: 'Agente A', email: 'a@example.com', language: 'es', languages: ['es'], avatar_initials: 'AA', accent_color: '#888888' },
    { id: AGENT_B, tenant_id: TENANT, name: 'Agente B', email: 'b@example.com', language: 'es', languages: ['es'], avatar_initials: 'AB', accent_color: '#888888' },
  ]), 'agents')
  const ch = must(await admin.from('acquisition_channels').insert([
    { tenant_id: TENANT, public_id: 'chn_lectnl000001', channel_type: 'newsletter', name: 'Newsletter', slug: 'lect-nl' },
    { tenant_id: TENANT, public_id: 'chn_lectfm000001', channel_type: 'contact_form', name: 'Formulario', slug: 'lect-fm' },
    { tenant_id: TENANT, public_id: 'chn_lectem000001', channel_type: 'contact_form', name: 'Sin leads', slug: 'lect-em' },
  ]).select('id, slug'), 'channels') as { id: string; slug: string }[]
  nlChannel = ch.find(c => c.slug === 'lect-nl')!.id
  formChannel = ch.find(c => c.slug === 'lect-fm')!.id
  emptyChannel = ch.find(c => c.slug === 'lect-em')!.id
})

afterAll(cleanup)

async function histogram(agent: string | null = null, tenant: string | null = TENANT) {
  const { data, error } = await admin.rpc('lead_score_histogram', { p_tenant_id: tenant, p_agent_id: agent })
  if (error) throw new Error(error.message)
  return data as number[]
}

describe('lead_score_histogram', () => {
  it('score 100 en el último tramo, score 0 en el primero, nulo fuera', async () => {
    await clearLeads()
    await lead({ score: 100 })
    await lead({ score: 0 })
    await lead({ score: 9 })
    await lead({ score: 10 })
    await lead({ score: 99 })
    await lead({ score: null })
    const h = await histogram()
    expect(h).toHaveLength(10)
    expect(h[0]).toBe(2)
    expect(h[1]).toBe(1)
    expect(h[9]).toBe(2)
    expect(h.reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('excluye en_proceso, cerrados y suscriptores; respeta p_agent_id', async () => {
    await clearLeads()
    await lead({ score: 55 })
    await lead({ score: 55, stage: 'nutricion', agent: AGENT_B })
    await lead({ score: 55, stage: 'en_proceso' })
    await lead({ score: 55, stage: 'cerrado' })
    await lead({ score: 55, metadata: { newsletter_subscriber: { edition_id: null } } })
    expect((await histogram())[5]).toBe(2)
    expect((await histogram(AGENT_A))[5]).toBe(1)
    expect((await histogram(AGENT_B))[5]).toBe(1)
    expect((await histogram(null, EMPTY_T)).every(v => v === 0)).toBe(true)
  })
})

async function growth(tenant = TENANT, months = 7) {
  const { data, error } = await admin.rpc('newsletter_growth', { p_tenant_id: tenant, p_months: months })
  if (error) throw new Error(error.message)
  return data as {
    active_now: number; net_reliable: boolean
    monthly: { month: string; signups: number; unsubscribes: number; active_end: number }[]
  }
}

describe('newsletter_growth', () => {
  it('active_end = altas acumuladas - bajas acumuladas, y el último coincide con active_now', async () => {
    await clearLeads()
    await lead({ channel: nlChannel, createdAt: ago(70) })
    await lead({ channel: nlChannel, createdAt: ago(40) })
    const gone = await lead({ channel: nlChannel, createdAt: ago(35), blocked: 'unsubscribed' })
    await unsubEvent(gone, ago(2))
    await lead({ channel: nlChannel, createdAt: ago(1), blocked: 'hard_bounce' })
    await lead({ channel: formChannel, createdAt: ago(1) }) // otro canal: no cuenta

    const g = await growth()
    expect(g.monthly).toHaveLength(7)
    expect(g.active_now).toBe(3)
    expect(g.net_reliable).toBe(true)
    let signups = 0
    let unsubs = 0
    for (const m of g.monthly) {
      signups += m.signups
      unsubs += m.unsubscribes
    }
    expect(signups).toBe(4)
    expect(unsubs).toBe(1)
    expect(g.monthly.at(-1)!.active_end).toBe(g.active_now)
    // cada mes = anterior + altas - bajas (no hay historia previa a la ventana)
    for (let i = 1; i < g.monthly.length; i++) {
      expect(g.monthly[i].active_end).toBe(g.monthly[i - 1].active_end + g.monthly[i].signups - g.monthly[i].unsubscribes)
    }
    const months = g.monthly.map(m => m.month)
    expect(months).toEqual([...months].sort())
    expect(new Set(months).size).toBe(7)
  })

  it('una baja sin evento pone net_reliable en false', async () => {
    await clearLeads()
    await lead({ channel: nlChannel, blocked: 'unsubscribed' })
    const g = await growth()
    expect(g.net_reliable).toBe(false)
    expect(g.active_now).toBe(0)
  })

  it('tenant sin suscriptores devuelve ceros en los 7 meses', async () => {
    const g = await growth(EMPTY_T)
    expect(g.active_now).toBe(0)
    expect(g.net_reliable).toBe(true)
    expect(g.monthly).toHaveLength(7)
    expect(g.monthly.every(m => m.signups === 0 && m.unsubscribes === 0 && m.active_end === 0)).toBe(true)
  })
})

async function trend(days: number, tz = 'UTC', tenant: string | null = TENANT) {
  const { data, error } = await admin.rpc('channel_leads_trend', { p_tenant_id: tenant, p_days: days, p_time_zone: tz })
  if (error) throw new Error(error.message)
  return data as Record<string, number[]>
}

describe('channel_leads_trend', () => {
  it('fuente sin leads devuelve ceros, con el largo de la ventana', async () => {
    await clearLeads()
    for (const [days, len] of [[7, 7], [28, 4], [91, 13]] as const) {
      const t = await trend(days)
      expect(t[emptyChannel]).toEqual(Array(len).fill(0))
    }
  })

  it('cuenta leads por barra, con las mismas barras que Envíos', async () => {
    await clearLeads()
    await lead({ channel: formChannel, createdAt: new Date(Date.now() - 1000).toISOString() })
    await lead({ channel: formChannel, createdAt: ago(2) })
    await lead({ channel: formChannel, createdAt: ago(20) })
    await lead({ channel: formChannel, createdAt: ago(200) }) // fuera de la ventana
    const t7 = await trend(7)
    expect(t7[formChannel]).toHaveLength(7)
    expect(t7[formChannel].at(-1)).toBeGreaterThanOrEqual(1)
    expect(t7[formChannel].reduce((a, b) => a + b, 0)).toBe(2)
    const t28 = await trend(28)
    expect(t28[formChannel].reduce((a, b) => a + b, 0)).toBe(3)
    expect(t28[formChannel].at(-1)).toBe(2)
    expect(t28[nlChannel]).toEqual([0, 0, 0, 0])
  })

  it('no mezcla tenants', async () => {
    expect(Object.keys(await trend(7, 'UTC', EMPTY_T))).toEqual([])
  })
})
