import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Suite de integración del despachador de correos grupales. Corre contra el
// sandbox con un tenant temporal que se limpia al final, y con Resend SIMULADO:
// mide qué se le entregaría a Resend y qué queda en la base. Nada sale a un buzón.
//
//   npm run test:broadcasts
//
// Cubre lo que un error convertiría en correos reales mal enviados: la
// audiencia, el alcance del agente, la repetición, el 429, la cancelación, la
// guarda de reputación, la cuota y la dirección postal.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? ws

process.env.UNSUBSCRIBE_SECRET ??= 'secreto-de-prueba'

const fake = vi.hoisted(() => {
  type Payload = { to: string; subject?: string; html?: string; from?: string; replyTo?: string }
  const state = {
    batches: [] as Payload[][],
    mode: 'ok' as 'ok' | 'rate_limited',
    counter: 0,
    allowance: { limit: 100000, used: 0 },
  }
  const client = {
    batch: {
      send: async (payload: Payload[]) => {
        if (state.mode === 'rate_limited') {
          return { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }, headers: null }
        }
        state.batches.push(payload)
        return { data: { data: payload.map(() => ({ id: `fake_bc_${Date.now()}_${++state.counter}` })) }, error: null, headers: null }
      },
    },
    emails: { send: async () => ({ data: { id: 'unused' }, error: null, headers: null }) },
  }
  return { state, client }
})

vi.mock('@/lib/resend', () => ({
  resendForAccount: () => fake.client,
  resolveResendAccount: () => 'itmano',
}))
vi.mock('@/lib/services/open-house-sender', () => ({
  resolveOpenHouseSender: async () => ({
    ok: true,
    sender: { identity: { account: 'itmano', from: 'Equipo <hola@equipo-prueba.com>' }, tenantName: 'Equipo', tenantSlug: 'test-broadcast' },
  }),
}))
vi.mock('@/lib/subscriptions/quota', () => ({
  monthlyEmailAllowance: async () => fake.state.allowance,
}))

const { dispatchBroadcast, POSTAL_ADDRESS_REQUIRED_MESSAGE } = await import('@/lib/services/broadcast-dispatch')
const { previewBroadcastRecipients } = await import('@/lib/services/broadcast-audience')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } },
)

const TENANT  = 'tenant-test-broadcast'
const AGENT_A = 'agent-test-broadcast-a'
const AGENT_B = 'agent-test-broadcast-b'
const POSTAL  = '100 Calle Prueba, Miami FL'

let tagA = ''
let tagB = ''

const LEADS = [
  // id, agente, idioma, etiquetas, bloqueado, origen
  { id: 'bc-es',       agent: AGENT_A, language: 'es', tags: ['A'],      blocked: false, source: 'direct' },
  { id: 'bc-en',       agent: AGENT_A, language: 'en', tags: ['A', 'B'], blocked: false, source: 'direct' },
  { id: 'bc-pt',       agent: AGENT_A, language: 'pt', tags: ['A'],      blocked: false, source: 'direct' }, // el agente no habla pt → inglés
  { id: 'bc-blocked',  agent: AGENT_A, language: 'es', tags: ['A'],      blocked: true,  source: 'direct' },
  { id: 'bc-imported', agent: AGENT_A, language: 'es', tags: ['A'],      blocked: false, source: 'import' },
  { id: 'bc-only-b',   agent: AGENT_A, language: 'es', tags: ['B'],      blocked: false, source: 'direct' },
  { id: 'bc-other',    agent: AGENT_B, language: 'es', tags: ['A'],      blocked: false, source: 'direct' },
]

async function cleanup() {
  await admin.from('email_broadcasts').delete().eq('tenant_id', TENANT)
  for (const table of ['email_sends', 'notifications', 'lead_events', 'lead_status_history', 'lead_tag_assignments']) {
    await admin.from(table).delete().eq('tenant_id', TENANT)
  }
  await admin.from('lead_tags').delete().eq('tenant_id', TENANT)
  await admin.from('leads').delete().eq('tenant_id', TENANT)
  await admin.from('agents').delete().eq('tenant_id', TENANT)
  await admin.from('tenants').delete().eq('id', TENANT)
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

const CONTENT = { v: 1, body: 'Hola {{customer_name}}, tenemos novedades.' }

async function createBroadcast(opts: {
  audience: Record<string, unknown>
  languages?: string[]
  scopeAgentId?: string | null
  senderAgentId?: string | null
  status?: string
}): Promise<string> {
  const row = must(await admin.from('email_broadcasts').insert({
    tenant_id: TENANT, name: 'Prueba', audience: opts.audience,
    languages: opts.languages ?? ['es', 'en'],
    scope_agent_id: opts.scopeAgentId ?? null,
    sender_agent_id: opts.senderAgentId ?? null,
    status: opts.status ?? 'pending',
    scheduled_at: new Date(Date.now() - 1000).toISOString(),
  }).select('id').single(), 'broadcast') as { id: string }
  must(await admin.from('email_broadcast_contents').insert((opts.languages ?? ['es', 'en']).map(language => ({
    broadcast_id: row.id, tenant_id: TENANT, language, subject: `Asunto ${language}`, body_json: CONTENT,
  }))), 'contents')
  return row.id
}

async function readBroadcast(id: string) {
  return must(await admin.from('email_broadcasts').select('*').eq('id', id).single(), 'read') as {
    status: string; sent_count: number; skipped_count: number; last_error: string | null
  }
}

const dispatch = (id: string) => dispatchBroadcast(admin, id, { deadline: Date.now() + 30_000 })
const sentTo = () => fake.state.batches.flat().map(p => p.to).sort()

beforeAll(async () => {
  await cleanup()
  must(await admin.from('tenants').insert({ id: TENANT, name: 'Broadcast Test', slug: 'test-broadcast', currency: 'USD', postal_address: POSTAL }), 'tenant')
  must(await admin.from('agents').insert([
    { id: AGENT_A, tenant_id: TENANT, name: 'Agente A', email: 'agente.a@example.com', language: 'es', languages: ['es', 'en'], avatar_initials: 'AA', accent_color: '#888888', email_signature: 'Firma A' },
    { id: AGENT_B, tenant_id: TENANT, name: 'Agente B', email: 'agente.b@example.com', language: 'es', languages: ['es', 'en'], avatar_initials: 'AB', accent_color: '#888888', email_signature: 'Firma B' },
  ]), 'agents')
  const tags = must(await admin.from('lead_tags').insert([
    { tenant_id: TENANT, name: 'Tag A', slug: 'tag-a' },
    { tenant_id: TENANT, name: 'Tag B', slug: 'tag-b' },
  ]).select('id, slug'), 'tags') as { id: string; slug: string }[]
  tagA = tags.find(t => t.slug === 'tag-a')!.id
  tagB = tags.find(t => t.slug === 'tag-b')!.id

  must(await admin.from('leads').insert(LEADS.map(l => ({
    id: l.id, tenant_id: TENANT, agent_id: l.agent, first_name: l.id, last_name: 'Test',
    email: `${l.id}@example.com`, language: l.language, stage: 'nuevo',
    email_blocked: l.blocked, email_blocked_reason: l.blocked ? 'unsubscribed' : null,
    traffic_source: l.source, peak_score: 0, current_score: 0,
  }))), 'leads')
  must(await admin.from('lead_tag_assignments').insert(LEADS.flatMap(l => l.tags.map(t => ({
    lead_id: l.id, tag_id: t === 'A' ? tagA : tagB, tenant_id: TENANT,
  })))), 'assignments')
})

afterAll(cleanup)

beforeEach(async () => {
  fake.state.batches = []
  fake.state.mode = 'ok'
  fake.state.allowance = { limit: 100000, used: 0 }
  await admin.from('email_broadcasts').delete().eq('tenant_id', TENANT)
  await admin.from('email_sends').delete().eq('tenant_id', TENANT)
  await admin.from('tenants').update({ postal_address: POSTAL }).eq('id', TENANT)
})

const segment = (extra: Record<string, unknown>) => ({ mode: 'segment', ...extra })

describe('audiencia', () => {
  it('envía a la etiqueta, en el idioma de cada lead, y deja fuera a los bloqueados', async () => {
    const id = await createBroadcast({ audience: segment({ tagIds: [tagA] }) })
    const res = await dispatch(id)

    expect(res.outcome).toBe('sent')
    expect(sentTo()).toEqual(['bc-en@example.com', 'bc-es@example.com', 'bc-imported@example.com', 'bc-other@example.com', 'bc-pt@example.com'])
    const payloads = fake.state.batches.flat()
    expect(payloads.find(p => p.to === 'bc-es@example.com')!.subject).toBe('Asunto es')
    // pt no lo atiende su agente: inglés, la misma regla que los demás correos.
    expect(payloads.find(p => p.to === 'bc-pt@example.com')!.subject).toBe('Asunto en')

    const b = await readBroadcast(id)
    expect(b.status).toBe('sent')
    expect(b.sent_count).toBe(5)
    expect(b.skipped_count).toBe(1)
  })

  it('all exige todas las etiquetas', async () => {
    await dispatch(await createBroadcast({ audience: segment({ tagIds: [tagA, tagB], tagMatch: 'all' }) }))
    expect(sentTo()).toEqual(['bc-en@example.com'])
  })

  it('sin criterios no le escribe a nadie', async () => {
    const id = await createBroadcast({ audience: segment({}) })
    await dispatch(id)
    expect(fake.state.batches).toHaveLength(0)
    expect((await readBroadcast(id)).sent_count).toBe(0)
  })

  it('un agente sólo alcanza a sus leads, aunque el filtro pida otra cosa', async () => {
    await dispatch(await createBroadcast({ audience: segment({ tagIds: [tagA], agentId: AGENT_B }), scopeAgentId: AGENT_A }))
    expect(fake.state.batches).toHaveLength(0)

    await dispatch(await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es', 'bc-other'] }, scopeAgentId: AGENT_A }))
    expect(sentTo()).toEqual(['bc-es@example.com'])
  })

  it('excluye importados y a los quitados a mano', async () => {
    await dispatch(await createBroadcast({
      audience: segment({ tagIds: [tagA], excludeImported: true, excludedLeadIds: ['bc-pt', 'bc-other'] }),
    }))
    expect(sentTo()).toEqual(['bc-en@example.com', 'bc-es@example.com'])
  })

  it('la vista previa coincide con el envío y cuenta a los importados', async () => {
    const audience = { ...segment({ tagIds: [tagA] }), tagMatch: 'any', stages: [], agentId: 'all', channelId: 'all', source: 'all', language: 'all', quality: 'all', q: '', excludeImported: false, excludedLeadIds: [] }
    const preview = await previewBroadcastRecipients(admin, TENANT, null, audience as never, ['es', 'en'])
    expect(preview.summary.toSend).toBe(5)
    expect(preview.summary.skipped).toEqual({ email_blocked: 1 })
    expect(preview.imported).toBe(1)
    expect(preview.overflow).toBe(false)
  })

  it('un idioma sin versión no recibe nada', async () => {
    const id = await createBroadcast({ audience: segment({ tagIds: [tagA] }), languages: ['es'] })
    await dispatch(id)
    expect(sentTo()).toEqual(['bc-es@example.com', 'bc-imported@example.com', 'bc-other@example.com'])
    const { data } = await admin.from('email_broadcast_recipients').select('lead_id, skip_reason').eq('broadcast_id', id).eq('status', 'skipped')
    expect((data ?? []).filter(r => r.skip_reason === 'no_language').map(r => r.lead_id).sort()).toEqual(['bc-en', 'bc-pt'])
  })
})

describe('contenido y registro', () => {
  it('lleva firma del agente del lead, dirección postal y baja; reply_to al agente', async () => {
    await dispatch(await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-other'] } }))
    const [p] = fake.state.batches.flat()
    expect(p.html).toContain(POSTAL)
    expect(p.html).toContain('Firma B')
    expect(p.html).toContain('Hola bc-other')
    expect(p.replyTo).toBe('agente.b@example.com')
  })

  it('un remitente fijo firma todos los correos', async () => {
    await dispatch(await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-other'] }, senderAgentId: AGENT_A }))
    const [p] = fake.state.batches.flat()
    expect(p.html).toContain('Firma A')
    expect(p.replyTo).toBe('agente.a@example.com')
  })

  it('escribe email_sends con su vínculo y ningún lead_event', async () => {
    const before = await admin.from('lead_events').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT)
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] } })
    await dispatch(id)
    const { data: sends } = await admin.from('email_sends').select('send_type, broadcast_id, lead_id').eq('tenant_id', TENANT)
    expect(sends).toEqual([{ send_type: 'broadcast', broadcast_id: id, lead_id: 'bc-es' }])
    const after = await admin.from('lead_events').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT)
    expect(after.count).toBe(before.count)
  })
})

describe('repetición y fallos', () => {
  it('un segundo despacho no repite a nadie', async () => {
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] } })
    await dispatch(id)
    expect((await dispatch(id)).outcome).toBe('not_due')
    expect(sentTo()).toEqual(['bc-es@example.com'])
  })

  it('dos a la vez no duplican', async () => {
    const id = await createBroadcast({ audience: segment({ tagIds: [tagA] }) })
    const results = await Promise.all([dispatch(id), dispatch(id)])
    expect(results.filter(r => r.outcome === 'sent')).toHaveLength(1)
    expect(new Set(sentTo()).size).toBe(sentTo().length)
  })

  it('un 429 lo deja pendiente y la siguiente ejecución termina', async () => {
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] } })
    fake.state.mode = 'rate_limited'
    expect((await dispatch(id)).outcome).toBe('partial')
    const b = await readBroadcast(id)
    expect(b.status).toBe('pending')
    expect(b.last_error).toMatch(/limitó/)

    fake.state.mode = 'ok'
    expect((await dispatch(id)).outcome).toBe('sent')
    expect(sentTo()).toEqual(['bc-es@example.com'])
  })

  it('un borrador o un cancelado no salen', async () => {
    const draft = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] }, status: 'draft' })
    const cancelled = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] }, status: 'cancelled' })
    expect((await dispatch(draft)).outcome).toBe('not_due')
    expect((await dispatch(cancelled)).outcome).toBe('not_due')
    expect(fake.state.batches).toHaveLength(0)
  })

  it('una programación futura espera', async () => {
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] } })
    await admin.from('email_broadcasts').update({ scheduled_at: new Date(Date.now() + 3_600_000).toISOString() }).eq('id', id)
    expect((await dispatch(id)).outcome).toBe('not_due')
  })
})

describe('guardas', () => {
  it('no sale sin dirección postal', async () => {
    await admin.from('tenants').update({ postal_address: null }).eq('id', TENANT)
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es'] } })
    expect((await dispatch(id)).outcome).toBe('failed')
    expect((await readBroadcast(id)).last_error).toBe(POSTAL_ADDRESS_REQUIRED_MESSAGE)
    expect(fake.state.batches).toHaveLength(0)
  })

  it('si no cabe entero en el cupo, no sale ninguno', async () => {
    fake.state.allowance = { limit: 100, used: 98 }
    const id = await createBroadcast({ audience: segment({ tagIds: [tagA] }) })
    expect((await dispatch(id)).outcome).toBe('failed')
    expect((await readBroadcast(id)).last_error).toMatch(/quedan 2 de 100/)
    expect(fake.state.batches).toHaveLength(0)
  })

  it('una queja de spam pausa lo que falta; reanudar con la marca sigue', async () => {
    const id = await createBroadcast({ audience: { mode: 'manual', leadIds: ['bc-es', 'bc-en'] } })
    const sentAt = new Date(Date.now() - 60_000).toISOString()
    must(await admin.from('email_sends').insert({
      tenant_id: TENANT, lead_id: 'bc-only-b', resend_email_id: `fake_guard_${Date.now()}`, send_type: 'broadcast', broadcast_id: id, sent_at: sentAt,
    }), 'send')
    must(await admin.from('lead_events').insert({
      tenant_id: TENANT, lead_id: 'bc-only-b', type: 'email_spam_complaint', description: 'queja', dedup_key: `guard_${id}`,
    }), 'event')

    expect((await dispatch(id)).outcome).toBe('paused')
    const paused = await readBroadcast(id)
    expect(paused.status).toBe('paused')
    expect(paused.last_error).toMatch(/spam/)
    expect(fake.state.batches).toHaveLength(0)

    // Lo que hace resumeBroadcast.
    await admin.from('email_broadcasts').update({
      status: 'pending', scheduled_at: new Date(Date.now() - 1000).toISOString(), guard_overridden_at: new Date().toISOString(),
    }).eq('id', id)
    expect((await dispatch(id)).outcome).toBe('sent')
    expect(sentTo()).toEqual(['bc-en@example.com', 'bc-es@example.com'])
  })
})
