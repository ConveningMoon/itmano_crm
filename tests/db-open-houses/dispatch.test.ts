import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Suite de integración del despachador y el RSVP de open houses. Corre contra
// el sandbox con un tenant temporal que se limpia al final, y con Resend
// SIMULADO: el test mide qué se le entregaría a Resend y qué queda en la base,
// no si Resend responde. Nada sale a un buzón.
//
//   npm run test:open-houses
//
// Cubre lo que un error convertiría en correos reales mal enviados:
//   · la audiencia (etiquetas, idioma, bloqueados) se congela una vez;
//   · un segundo despacho —o dos a la vez— no repite a nadie;
//   · un 429 de Resend deja el correo pendiente para la siguiente ejecución;
//   · el recordatorio sólo va a quien confirmó;
//   · un correo de un open house cancelado no sale;
//   · el RSVP crea el lead nuevo y puntúa una sola vez.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? ws

process.env.UNSUBSCRIBE_SECRET ??= 'secreto-de-prueba'

const fake = vi.hoisted(() => {
  type Payload = { to: string; subject?: string; html?: string }
  const state = {
    batches: [] as Payload[][],
    mode: 'ok' as 'ok' | 'rate_limited',
    counter: 0,
  }
  const client = {
    batch: {
      send: async (payload: Payload[]) => {
        if (state.mode === 'rate_limited') {
          return { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }, headers: null }
        }
        state.batches.push(payload)
        return { data: { data: payload.map(() => ({ id: `fake_${++state.counter}` })) }, error: null, headers: null }
      },
    },
    emails: {
      send: async () => ({ data: { id: `fake_${++state.counter}` }, error: null, headers: null }),
    },
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
    sender: { identity: { account: 'itmano', from: 'Equipo <hola@equipo-prueba.com>' }, tenantName: 'Equipo', tenantSlug: 'test-openhouse' },
  }),
}))

const { dispatchOpenHouseEmail } = await import('@/lib/services/open-house-dispatch')
const { recordOpenHouseRsvp } = await import('@/lib/services/open-house-rsvp')

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } },
)

const TENANT = 'tenant-test-openhouse'
const AGENT  = 'agent-test-openhouse'
const H = 60 * 60 * 1000

let tagA = ''
let tagB = ''
let propertyId = ''

const LEADS = [
  // id, idioma, etiquetas, bloqueado
  { id: 'oh-lead-es',      language: 'es', tags: ['A'],      blocked: false },
  { id: 'oh-lead-en',      language: 'en', tags: ['A', 'B'], blocked: false },
  { id: 'oh-lead-pt',      language: 'pt', tags: ['A'],      blocked: false }, // el agente no habla pt → inglés
  { id: 'oh-lead-blocked', language: 'es', tags: ['A'],      blocked: true  },
  { id: 'oh-lead-only-b',  language: 'es', tags: ['B'],      blocked: false }, // fuera de la audiencia [A]
]

async function cleanup() {
  const { data: ohs } = await admin.from('open_houses').select('id').eq('tenant_id', TENANT)
  if (ohs?.length) await admin.from('open_houses').delete().eq('tenant_id', TENANT)
  for (const table of ['email_sends', 'notifications', 'lead_events', 'lead_status_history', 'lead_tag_assignments']) {
    await admin.from(table).delete().eq('tenant_id', TENANT)
  }
  await admin.from('lead_tags').delete().eq('tenant_id', TENANT)
  await admin.from('leads').delete().eq('tenant_id', TENANT)
  await admin.from('properties').delete().eq('tenant_id', TENANT)
  await admin.from('agents').delete().eq('tenant_id', TENANT)
  await admin.from('tenants').delete().eq('id', TENANT)
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

beforeAll(async () => {
  await cleanup()
  must(await admin.from('tenants').insert({ id: TENANT, name: 'Open House Test', slug: 'test-openhouse', currency: 'USD' }), 'tenant')
  must(await admin.from('agents').insert({
    id: AGENT, tenant_id: TENANT, name: 'Agente OH', email: 'agente.oh@example.com',
    language: 'es', languages: ['es', 'en'], avatar_initials: 'AO', accent_color: '#888888',
  }), 'agent')
  const tags = must(await admin.from('lead_tags').insert([
    { tenant_id: TENANT, name: 'Tag A', slug: 'tag-a' },
    { tenant_id: TENANT, name: 'Tag B', slug: 'tag-b' },
  ]).select('id, slug'), 'tags') as { id: string; slug: string }[]
  tagA = tags.find(t => t.slug === 'tag-a')!.id
  tagB = tags.find(t => t.slug === 'tag-b')!.id

  must(await admin.from('leads').insert(LEADS.map(l => ({
    id: l.id, tenant_id: TENANT, agent_id: AGENT, first_name: l.id, last_name: 'Test',
    email: `${l.id}@example.com`, language: l.language, stage: 'nuevo',
    email_blocked: l.blocked, email_blocked_reason: l.blocked ? 'unsubscribed' : null,
    traffic_source: 'direct', peak_score: 0, current_score: 0,
  }))), 'leads')
  must(await admin.from('lead_tag_assignments').insert(LEADS.flatMap(l => l.tags.map(t => ({
    lead_id: l.id, tag_id: t === 'A' ? tagA : tagB, tenant_id: TENANT,
  })))), 'assignments')

  const prop = must(await admin.from('properties').insert({
    tenant_id: TENANT, address: '1 Test St', city: 'Miami', property_type: 'residential', created_by_agent_id: AGENT,
  }).select('id').single(), 'property') as { id: string }
  propertyId = prop.id
})

afterAll(cleanup)

beforeEach(() => {
  fake.state.batches = []
  fake.state.mode = 'ok'
})

async function createOpenHouse(opts: { startsInHours: number; status?: 'scheduled' | 'cancelled' | 'draft' }) {
  const startsAt = new Date(Date.now() + opts.startsInHours * H)
  const oh = must(await admin.from('open_houses').insert({
    tenant_id: TENANT, property_id: propertyId,
    starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + 2 * H).toISOString(),
    timezone: 'America/New_York', languages: ['es', 'en'],
    audience_tag_ids: [tagA], audience_match: 'any', status: opts.status ?? 'scheduled',
    created_by_agent_id: AGENT,
  }).select('id').single(), 'open house') as { id: string }
  return oh.id
}

async function createEmail(openHouseId: string, kind: 'announcement' | 'reminder' | 'cancellation') {
  const email = must(await admin.from('open_house_emails').insert({
    tenant_id: TENANT, open_house_id: openHouseId, kind, scheduled_at: new Date(Date.now() - 60_000).toISOString(),
  }).select('id').single(), 'email') as { id: string }
  must(await admin.from('open_house_email_contents').insert(['es', 'en'].map(language => ({
    email_id: email.id, tenant_id: TENANT, language,
    subject: `Asunto ${language} {{property_name}}`, body_json: { v: 1, body: `Hola {{customer_name}}\n\n{{rsvp_url}}` },
  }))), 'contents')
  return email.id
}

async function recipients(emailId: string) {
  const { data } = await admin.from('open_house_email_recipients').select('lead_id, status, skip_reason, language').eq('email_id', emailId)
  return new Map((data ?? []).map(r => [r.lead_id as string, r]))
}

const deadline = () => Date.now() + 30_000

describe('anuncio', () => {
  let ohId = ''
  let emailId = ''

  beforeAll(async () => {
    ohId = await createOpenHouse({ startsInHours: 72 })
    emailId = await createEmail(ohId, 'announcement')
  })

  it('envía a la audiencia en su idioma y omite al bloqueado', async () => {
    const res = await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    expect(res.outcome).toBe('sent')
    expect(res.sent).toBe(3)

    const sentTo = fake.state.batches.flat().map(p => p.to).sort()
    expect(sentTo).toEqual(['oh-lead-en@example.com', 'oh-lead-es@example.com', 'oh-lead-pt@example.com'])
    const es = fake.state.batches.flat().find(p => p.to === 'oh-lead-es@example.com')!
    expect(es.subject).toBe('Asunto es 1 Test St')
    expect(es.html).toContain('/web/test-openhouse/rsvp/')

    const r = await recipients(emailId)
    expect(r.get('oh-lead-pt')).toMatchObject({ status: 'sent', language: 'en' })
    expect(r.get('oh-lead-blocked')).toMatchObject({ status: 'skipped', skip_reason: 'email_blocked' })
    expect(r.has('oh-lead-only-b')).toBe(false)

    const { data: email } = await admin.from('open_house_emails').select('status, sent_count, skipped_count').eq('id', emailId).single()
    expect(email).toEqual({ status: 'sent', sent_count: 3, skipped_count: 1 })

    const { count } = await admin.from('email_sends').select('id', { count: 'exact', head: true })
      .eq('open_house_email_id', emailId).eq('send_type', 'open_house')
    expect(count).toBe(3)
  })

  it('un segundo despacho no vuelve a enviar', async () => {
    const res = await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    expect(res.outcome).toBe('not_due')
    expect(fake.state.batches).toHaveLength(0)
  })
})

describe('concurrencia e idempotencia', () => {
  it('dos despachos a la vez envían una sola vez a cada lead', async () => {
    const ohId = await createOpenHouse({ startsInHours: 120 })
    const emailId = await createEmail(ohId, 'announcement')
    const [a, b] = await Promise.all([
      dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() }),
      dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() }),
    ])
    expect(a.sent + b.sent).toBe(3)
    expect(fake.state.batches.flat()).toHaveLength(3)
  })
})

describe('rate limit', () => {
  it('deja el correo pendiente y sin enviar a nadie', async () => {
    const ohId = await createOpenHouse({ startsInHours: 168 })
    const emailId = await createEmail(ohId, 'announcement')
    fake.state.mode = 'rate_limited'
    const res = await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    expect(res.outcome).toBe('partial')
    const { data: email } = await admin.from('open_house_emails').select('status, last_error').eq('id', emailId).single()
    expect(email?.status).toBe('pending')
    expect(email?.last_error).toMatch(/Resend limitó/)
    const r = await recipients(emailId)
    expect([...r.values()].filter(x => x.status === 'pending')).toHaveLength(3)

    // La siguiente ejecución retoma donde quedó.
    fake.state.mode = 'ok'
    const again = await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    expect(again.outcome).toBe('sent')
    expect(again.sent).toBe(3)
  })
})

describe('RSVP y recordatorio', () => {
  let ohId = ''

  beforeAll(async () => {
    ohId = await createOpenHouse({ startsInHours: 200 })
  })

  it('un visitante nuevo crea su lead y puntúa una sola vez', async () => {
    const visitor = { firstName: 'Visita', lastName: 'Nueva', email: 'oh-visita@example.com', phone: null, language: 'es' as const }
    const first = await recordOpenHouseRsvp(admin, { openHouseId: ohId, response: 'yes', guests: 2, source: 'web', visitor })
    expect(first).toMatchObject({ ok: true, status: 'created', leadCreated: true })

    // Cambia de opinión y vuelve a confirmar: no suma otra vez.
    await recordOpenHouseRsvp(admin, { openHouseId: ohId, response: 'no', guests: 0, source: 'web', visitor })
    const again = await recordOpenHouseRsvp(admin, { openHouseId: ohId, response: 'yes', guests: 1, source: 'web', visitor })
    expect(again).toMatchObject({ ok: true, status: 'updated', leadCreated: false })

    const { data: lead } = await admin.from('leads').select('id, agent_id').eq('tenant_id', TENANT).eq('email', 'oh-visita@example.com').single()
    expect(lead?.agent_id).toBe(AGENT)
    const { count } = await admin.from('lead_events').select('id', { count: 'exact', head: true })
      .eq('lead_id', lead!.id).eq('type', 'event_submission')
    expect(count).toBe(1)
  })

  it('el recordatorio sólo va a quien confirmó', async () => {
    await recordOpenHouseRsvp(admin, { openHouseId: ohId, leadId: 'oh-lead-es', response: 'yes', guests: 0, source: 'email' })
    await recordOpenHouseRsvp(admin, { openHouseId: ohId, leadId: 'oh-lead-en', response: 'no', guests: 0, source: 'email' })
    const emailId = await createEmail(ohId, 'reminder')
    await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    const sentTo = fake.state.batches.flat().map(p => p.to).sort()
    expect(sentTo).toEqual(['oh-lead-es@example.com', 'oh-visita@example.com'])
  })

  it('no acepta respuestas de un borrador ni de un cancelado', async () => {
    const draft = await createOpenHouse({ startsInHours: 300, status: 'draft' })
    const res = await recordOpenHouseRsvp(admin, { openHouseId: draft, leadId: 'oh-lead-es', response: 'yes', guests: 0, source: 'email' })
    expect(res).toEqual({ ok: false, error: 'not_found' })
    const cancelled = await createOpenHouse({ startsInHours: 400, status: 'cancelled' })
    const res2 = await recordOpenHouseRsvp(admin, { openHouseId: cancelled, leadId: 'oh-lead-es', response: 'yes', guests: 0, source: 'email' })
    expect(res2).toEqual({ ok: false, error: 'cancelled' })
  })
})

describe('estado del open house', () => {
  it('un anuncio de un open house cancelado no sale', async () => {
    const ohId = await createOpenHouse({ startsInHours: 500, status: 'cancelled' })
    const emailId = await createEmail(ohId, 'announcement')
    const res = await dispatchOpenHouseEmail(admin, emailId, { deadline: deadline() })
    expect(res.outcome).toBe('cancelled')
    expect(fake.state.batches).toHaveLength(0)
  })
})
