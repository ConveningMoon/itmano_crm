import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// RPC email_dashboard_stats contra el sandbox, con un tenant temporal que se
// limpia al final. Sin Resend ni IA: sólo filas en email_sends y lead_events.
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

const TENANT  = 'tenant-test-dash-emails'
const OTHER_T = 'tenant-test-dash-emails-2'
const AGENT_A = 'agent-test-dash-a'
const AGENT_B = 'agent-test-dash-b'
const TZ = 'UTC'

let tagId = ''
let seqPlain = ''
let seqTag = ''
const runs: Record<string, string> = {} // `${lead}:${plain|tag}` → run id

const LEADS = [
  { id: 'dash-a1', agent: AGENT_A },
  { id: 'dash-a2', agent: AGENT_A },
  { id: 'dash-b1', agent: AGENT_B },
]

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

async function cleanup() {
  for (const t of [TENANT, OTHER_T]) {
    for (const table of ['email_sends', 'lead_events', 'lead_sequence_runs', 'email_sequences', 'lead_tags', 'leads', 'agents']) {
      await admin.from(table).delete().eq('tenant_id', t)
    }
    await admin.from('tenants').delete().eq('id', t)
  }
}

const DAY = 86_400_000
const at = (daysAgo: number, hourUtc = 15) => {
  const d = new Date(Date.now() - daysAgo * DAY)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d.toISOString()
}

/** Fecha local YYYY-MM-DD de "hoy - offset días" en la zona dada. */
function localDay(offsetDays: number, tz = TZ, from = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(from)
  const d = new Date(`${parts}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

let counter = 0
async function send(lead: string, type: string, sentAt: string, run?: 'plain' | 'tag', tenant = TENANT) {
  must(await admin.from('email_sends').insert({
    tenant_id: tenant, lead_id: lead, send_type: type, sent_at: sentAt,
    resend_email_id: `fake_dash_${Date.now()}_${++counter}`,
    sequence_run_id: run ? runs[`${lead}:${run}`] : null,
  }), 'send')
}

async function event(lead: string, type: string, createdAt: string) {
  must(await admin.from('lead_events').insert({
    tenant_id: TENANT, lead_id: lead, type, description: 'prueba', created_at: createdAt, dedup_key: `dash_${Date.now()}_${++counter}`,
  }), 'event')
}

type Stats = {
  total_sends: number; unique_leads: number
  click_rate: number; reply_rate: number; bounce_rate: number; unsubscribe_rate: number
  by_class: Record<string, number>
  series: { start: string; sends: number }[]
  by_sequence: Record<string, { total_sends: number; click_rate: number; reply_rate: number; bounce_rate: number; unsubscribe_rate: number }>
}

async function stats(opts: { agent?: string | null; days?: number; tz?: string; tenant?: string } = {}): Promise<Stats> {
  const { data, error } = await admin.rpc('email_dashboard_stats', {
    p_tenant_id: opts.tenant ?? TENANT,
    p_agent_id: opts.agent ?? null,
    p_days: opts.days ?? 7,
    p_time_zone: opts.tz ?? TZ,
  })
  if (error) throw new Error(error.message)
  return data as Stats
}

beforeAll(async () => {
  await cleanup()
  for (const t of [TENANT, OTHER_T]) {
    must(await admin.from('tenants').insert({ id: t, name: 'Dash Test', slug: t, currency: 'USD' }), 'tenant')
  }
  must(await admin.from('agents').insert([
    { id: AGENT_A, tenant_id: TENANT, name: 'Agente A', email: 'a@example.com', language: 'es', languages: ['es'], avatar_initials: 'AA', accent_color: '#888888' },
    { id: AGENT_B, tenant_id: TENANT, name: 'Agente B', email: 'b@example.com', language: 'es', languages: ['es'], avatar_initials: 'AB', accent_color: '#888888' },
  ]), 'agents')
  tagId = (must(await admin.from('lead_tags').insert({ tenant_id: TENANT, name: 'Tag', slug: 'tag-dash' }).select('id').single(), 'tag') as { id: string }).id
  const seqs = must(await admin.from('email_sequences').insert([
    { tenant_id: TENANT, name: 'Plain', activation_type: 'manual' },
    { tenant_id: TENANT, name: 'Por etiqueta', trigger_tag_id: tagId, activation_type: 'tag' },
  ]).select('id, name'), 'sequences') as { id: string; name: string }[]
  seqPlain = seqs.find(s => s.name === 'Plain')!.id
  seqTag = seqs.find(s => s.name === 'Por etiqueta')!.id

  must(await admin.from('leads').insert(LEADS.map(l => ({
    id: l.id, tenant_id: TENANT, agent_id: l.agent, first_name: l.id, last_name: 'Test',
    email: `${l.id}@example.com`, language: 'es', stage: 'nuevo', peak_score: 0, current_score: 0,
  }))), 'leads')
  for (const l of LEADS) {
    for (const [kind, seq] of [['plain', seqPlain], ['tag', seqTag]] as const) {
      const r = must(await admin.from('lead_sequence_runs').insert({ tenant_id: TENANT, lead_id: l.id, sequence_id: seq }).select('id').single(), 'run') as { id: string }
      runs[`${l.id}:${kind}`] = r.id
    }
  }
})

afterAll(cleanup)

beforeEach(async () => {
  await admin.from('email_sends').delete().eq('tenant_id', TENANT)
  await admin.from('lead_events').delete().eq('tenant_id', TENANT)
})

describe('email_dashboard_stats', () => {
  it('clasifica las cinco clases y suma Enviados', async () => {
    await send('dash-a1', 'sequence', at(2), 'plain')
    await send('dash-a1', 'sequence', at(2), 'plain')
    await send('dash-a1', 'sequence', at(2), 'tag')
    await send('dash-a1', 'broadcast', at(2))
    await send('dash-a2', 'broadcast', at(2))
    await send('dash-a2', 'purchase', at(2))
    await send('dash-a2', 'one_off', at(2))
    await send('dash-a2', 'open_house', at(2))
    await send('dash-b1', 'sequence', at(2), 'plain')

    const s = await stats()
    expect(s.by_class).toEqual({ secuencias: 3, grupales: 2, etiqueta: 1, cierre: 1, otros: 2 })
    expect(s.total_sends).toBe(9)
    expect(Object.values(s.by_class).reduce((a, b) => a + b, 0)).toBe(s.total_sends)
    expect(s.unique_leads).toBe(3)
  })

  it('el agente sólo cuenta envíos de sus leads', async () => {
    await send('dash-a1', 'sequence', at(2), 'plain') // secuencia de la agencia hacia su lead
    await send('dash-a2', 'broadcast', at(2))
    await send('dash-b1', 'sequence', at(2), 'plain') // lead de otro agente
    await send('dash-b1', 'broadcast', at(2))

    const a = await stats({ agent: AGENT_A })
    expect(a.total_sends).toBe(2)
    expect(a.by_class).toEqual({ secuencias: 1, grupales: 1, etiqueta: 0, cierre: 0, otros: 0 })
    expect(a.unique_leads).toBe(2)
    expect(a.by_sequence[seqPlain].total_sends).toBe(1)

    const b = await stats({ agent: AGENT_B })
    expect(b.total_sends).toBe(2)

    const all = await stats()
    expect(all.total_sends).toBe(4)
  })

  it('no mezcla tenants', async () => {
    await send('dash-a1', 'broadcast', at(2))
    const other = await stats({ tenant: OTHER_T })
    expect(other.total_sends).toBe(0)
  })

  it('un envío fuera de la ventana no cuenta', async () => {
    await send('dash-a1', 'broadcast', at(8))
    await send('dash-a1', 'broadcast', at(2))
    const s = await stats({ days: 7 })
    expect(s.total_sends).toBe(1)
    expect(s.series.reduce((a, b) => a + b.sends, 0)).toBe(1)
    // con 28 días el de hace 8 sí entra
    expect((await stats({ days: 28 })).total_sends).toBe(2)
  })

  it('el día se corta en la zona del tenant', async () => {
    // 03:00Z de hace 3 días es el día anterior en Nueva York (UTC-4/-5).
    const sentAt = at(3, 3)
    await send('dash-a1', 'broadcast', sentAt)

    const ny = await stats({ tz: 'America/New_York' })
    const utc = await stats({ tz: 'UTC' })
    const nyDay = localDay(0, 'America/New_York', new Date(sentAt))
    const utcDay = localDay(0, 'UTC', new Date(sentAt))
    expect(nyDay).not.toBe(utcDay)
    expect(ny.series.find(b => b.start === nyDay)?.sends).toBe(1)
    expect(utc.series.find(b => b.start === utcDay)?.sends).toBe(1)
    expect(ny.series.find(b => b.start === utcDay)?.sends).toBe(0)
  })

  it('devuelve todas las barras aunque estén en cero', async () => {
    for (const [days, n] of [[7, 7], [28, 4], [91, 13]] as const) {
      const s = await stats({ days })
      expect(s.total_sends).toBe(0)
      expect(s.series).toHaveLength(n)
      expect(s.series.every(b => b.sends === 0)).toBe(true)
      const starts = s.series.map(b => b.start)
      expect(starts).toEqual([...starts].sort())
      expect(new Set(starts).size).toBe(n)
      expect(starts[0]).toBe(localDay(days - 1))
    }
  })

  it('la última barra incluye hoy', async () => {
    await send('dash-a1', 'broadcast', new Date(Date.now() - 1000).toISOString())
    const s7 = await stats({ days: 7 })
    expect(s7.series.at(-1)).toEqual({ start: localDay(0), sends: 1 })
    const s28 = await stats({ days: 28 })
    expect(s28.series.at(-1)!.start).toBe(localDay(6))
    expect(s28.series.at(-1)!.sends).toBe(1)
    expect(s28.series.reduce((a, b) => a + b.sends, 0)).toBe(1)
  })

  it('tasas por lead con eventos posteriores al primer envío', async () => {
    // Dos envíos, un lead, un clic posterior → 100.
    await send('dash-a1', 'sequence', at(3), 'plain')
    await send('dash-a1', 'sequence', at(2), 'plain')
    await event('dash-a1', 'email_clicked', at(1))
    let s = await stats()
    expect(s.unique_leads).toBe(1)
    expect(s.total_sends).toBe(2)
    expect(s.click_rate).toBe(100)
    expect(s.reply_rate).toBe(0)

    // Otro lead cuyo clic es anterior a su envío: no cuenta → 50.
    await send('dash-a2', 'sequence', at(2), 'plain')
    await event('dash-a2', 'email_clicked', at(5))
    await event('dash-a2', 'email_replied', at(1))
    await event('dash-b1', 'email_unsubscribed', at(1)) // sin envíos: no cuenta
    s = await stats()
    expect(s.unique_leads).toBe(2)
    expect(s.click_rate).toBe(50)
    expect(s.reply_rate).toBe(50)
    expect(s.bounce_rate).toBe(0)
    expect(s.unsubscribe_rate).toBe(0)
    expect(s.by_sequence[seqPlain]).toMatchObject({ total_sends: 3, click_rate: 50, reply_rate: 50 })
  })

  it('el primer envío cuenta sólo dentro de la ventana', async () => {
    await send('dash-a1', 'broadcast', at(10)) // fuera
    await send('dash-a1', 'broadcast', at(2))  // primero de la ventana
    await event('dash-a1', 'email_clicked', at(5)) // posterior al de fuera, anterior al de la ventana
    const s = await stats({ days: 7 })
    expect(s.click_rate).toBe(0)
  })

  it('tenant sin envíos devuelve ceros, sin error', async () => {
    const s = await stats({ tenant: OTHER_T })
    expect(s).toMatchObject({
      total_sends: 0, unique_leads: 0, click_rate: 0, reply_rate: 0, bounce_rate: 0, unsubscribe_rate: 0,
      by_class: { secuencias: 0, grupales: 0, etiqueta: 0, cierre: 0, otros: 0 },
      by_sequence: {},
    })
    expect(s.series).toHaveLength(7)
  })

  it('bySequence no incluye envíos de otras clases', async () => {
    await send('dash-a1', 'sequence', at(2), 'plain')
    await send('dash-a1', 'sequence', at(2), 'tag')
    await send('dash-a1', 'broadcast', at(2))
    await send('dash-a1', 'purchase', at(2))
    const s = await stats()
    expect(Object.keys(s.by_sequence).sort()).toEqual([seqPlain, seqTag].sort())
    expect(s.by_sequence[seqPlain].total_sends).toBe(1)
    expect(s.by_sequence[seqTag].total_sends).toBe(1)
    expect(s.total_sends).toBe(4)
  })
})
