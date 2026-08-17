/**
 * Escrituras de /agent/v1 contra el SANDBOX real.
 * Todo lo que crea lo borra al terminar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-require-imports
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws') as typeof WebSocket

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const TOKEN_RW = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const TOKEN_RO = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

const sinParams = { params: Promise.resolve({} as Record<string, string>) }
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

function post(url: string, body: unknown, token = TOKEN_RW, idem?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`, 'content-type': 'application/json',
  }
  if (idem) headers['Idempotency-Key'] = idem
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

function patch(url: string, body: unknown, token = TOKEN_RW) {
  return new Request(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const CORREOS = [
  'nuevo.agentapi@example.com', 'idem.agentapi@example.com',
  'conflicto.agentapi@example.com', 'sinfit.agentapi@example.com',
]

let tenantId: string
let agentId: string
const creados: string[] = []

beforeAll(async () => {
  const { data: perfil } = await admin
    .from('user_profiles').select('id, tenant_id').not('tenant_id', 'is', null).limit(1).single()
  tenantId = perfil!.tenant_id as string

  const { data: agente } = await admin
    .from('agents').select('id').eq('tenant_id', tenantId).limit(1).single()
  agentId = agente!.id as string

  await admin.from('agent_tokens').insert([
    { tenant_id: tenantId, name: 'test rw', token_prefix: TOKEN_RW.slice(0, 25),
      token_hash: hash(TOKEN_RW), scopes: ['read', 'write'], bot_user_id: perfil!.id as string,
      expires_at: new Date(Date.now() + 3600_000).toISOString() },
    { tenant_id: tenantId, name: 'test ro', token_prefix: TOKEN_RO.slice(0, 25),
      token_hash: hash(TOKEN_RO), scopes: ['read'], bot_user_id: perfil!.id as string,
      expires_at: new Date(Date.now() + 3600_000).toISOString() },
  ])

  await admin.from('leads').delete().in('email', CORREOS)
})

afterAll(async () => {
  const { data } = await admin.from('leads').select('id').in('email', CORREOS)
  const ids = [...creados, ...(data ?? []).map(l => l.id as string)]
  if (ids.length) {
    await admin.from('agent_email_drafts').delete().in('lead_id', ids)
    await admin.from('lead_status_history').delete().in('lead_id', ids)
    await admin.from('lead_events').delete().in('lead_id', ids)
    await admin.from('leads').delete().in('id', ids)
  }
  await admin.from('agent_idempotency_keys').delete().eq('tenant_id', tenantId)
  await admin.from('agent_tokens').delete().in('token_hash', [hash(TOKEN_RW), hash(TOKEN_RO)])
})

describe('POST /agent/v1/leads', () => {
  it('crea el lead y devuelve 201 con su forma pública', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'Nuevo', last_name: 'AgentApi', email: CORREOS[0],
      owner: agentId, language: 'es',
    }), sinParams)

    expect(res.status).toBe(201)
    const body = await res.json()
    creados.push(body.id)

    expect(body.email).toBe(CORREOS[0])
    expect(body.stage).toBe('nuevo')
    expect(body.owner).toBe(agentId)
    expect(body.created_at).toMatch(/Z$/)
    expect(body).not.toHaveProperty('tenant_id')
  })

  it('el presupuesto llega a la columna generada vía metadata', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'ConFit', last_name: 'AgentApi', email: CORREOS[3],
      owner: agentId, intent: 'buy', budget_amount: 425000,
      form_answers: [
        { key: 'timeline', value: 'under_3_months' },
        { key: 'financing', value: 'preapproved' },
      ],
    }), sinParams)

    expect(res.status).toBe(201)
    const body = await res.json()
    creados.push(body.id)

    // budget_amount es GENERATED ALWAYS desde metadata->'budget_amount'.
    expect(body.budget).toEqual({ amount: '425000.00', currency: 'USD' })
  })

  it('la calificación puntúa: el fit deja de ser cero', async () => {
    const { data } = await admin
      .from('leads').select('fit_score, current_score, fit_profile').eq('email', CORREOS[3]).single()

    expect(data!.fit_score).toBeGreaterThan(0)
    expect(data!.current_score).toBeGreaterThan(0)
    expect(Object.keys(data!.fit_profile as object).length).toBeGreaterThan(0)
  })

  it('un lead sin calificación NO recibe los 10 puntos de form_baseline', async () => {
    const { data } = await admin
      .from('lead_events').select('type').eq('lead_id', creados[0])

    expect((data ?? []).map(e => e.type)).not.toContain('form_baseline')
    expect((data ?? []).map(e => e.type)).toContain('lead_created')
  })

  it('NO inscribe en ninguna secuencia ni deja envíos pendientes', async () => {
    const { count: corridas } = await admin.from('lead_sequence_runs')
      .select('*', { count: 'exact', head: true }).in('lead_id', creados)
    const { count: envios } = await admin.from('email_sends')
      .select('*', { count: 'exact', head: true }).in('lead_id', creados)

    expect(corridas).toBe(0)
    expect(envios).toBe(0)
  })

  it('rechaza un email duplicado indicando el lead existente', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'Duplicado', last_name: 'AgentApi', email: CORREOS[0], owner: agentId,
    }), sinParams)

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('unprocessable')
    expect(body.error.details.existing_lead_id).toBe(creados[0])
  })

  it('rechaza un owner que no existe en el tenant', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'SinDuenio', last_name: 'AgentApi', email: 'otro.agentapi@example.com',
      owner: 'agente-que-no-existe',
    }), sinParams)

    expect(res.status).toBe(422)
  })

  it('un token de solo lectura recibe 403 y no crea nada', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'NoDebe', last_name: 'Crearse', email: 'nodebe.agentapi@example.com',
      owner: agentId,
    }, TOKEN_RO), sinParams)

    expect(res.status).toBe(403)
    const { data } = await admin.from('leads').select('id').eq('email', 'nodebe.agentapi@example.com')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('Idempotency-Key', () => {
  it('la misma key con el mismo body no duplica y marca el replay', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const cuerpo = {
      first_name: 'Idem', last_name: 'AgentApi', email: CORREOS[1], owner: agentId,
    }

    const primera = await POST(post('http://x/agent/v1/leads', cuerpo, TOKEN_RW, 'k-idem-1'), sinParams)
    expect(primera.status).toBe(201)
    creados.push((await primera.clone().json()).id)

    const segunda = await POST(post('http://x/agent/v1/leads', cuerpo, TOKEN_RW, 'k-idem-1'), sinParams)
    expect(segunda.headers.get('Idempotency-Replayed')).toBe('true')
    expect(await segunda.json()).toEqual(await primera.json())

    const { count } = await admin.from('leads')
      .select('*', { count: 'exact', head: true }).eq('email', CORREOS[1])
    expect(count).toBe(1)
  })

  it('la misma key con OTRO body devuelve 409 idempotency_key_reuse', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(post('http://x/agent/v1/leads', {
      first_name: 'Conflicto', last_name: 'AgentApi', email: CORREOS[2], owner: agentId,
    }, TOKEN_RW, 'k-idem-1'), sinParams)

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('idempotency_key_reuse')
    expect(body.error.retryable).toBe(false)

    const { data } = await admin.from('leads').select('id').eq('email', CORREOS[2])
    expect(data ?? []).toHaveLength(0)
  })
})

describe('PATCH /agent/v1/leads/{id}', () => {
  it('mueve la etapa y la deja registrada en el historial', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/leads/[id]/route')
    const id = creados[0]

    const res = await PATCH(patch(`http://x/agent/v1/leads/${id}`, { stage: 'en_proceso' }), conId(id))

    // 200, no 201: PATCH actualiza, no crea.
    expect(res.status).toBe(200)
    expect((await res.json()).stage).toBe('en_proceso')

    const { data } = await admin.from('lead_status_history')
      .select('from_status, to_status, source').eq('lead_id', id)

    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ from_status: 'nuevo', to_status: 'en_proceso', source: 'agent' })
  })

  it('exige al menos un campo', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await PATCH(patch(`http://x/agent/v1/leads/${creados[0]}`, {}), conId(creados[0]))
    expect(res.status).toBe(400)
  })

  it('un lead inexistente devuelve 404', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await PATCH(patch('http://x/agent/v1/leads/no-existe', { stage: 'cerrado' }), conId('no-existe'))
    expect(res.status).toBe(404)
  })
})

describe('POST /agent/v1/notes', () => {
  it('adjunta una nota al lead sin tocar su score', async () => {
    const { POST } = await import('@/app/api/agent/v1/notes/route')
    const id = creados[0]
    const { data: antes } = await admin.from('leads').select('current_score').eq('id', id).single()

    const res = await POST(post('http://x/agent/v1/notes', {
      target_type: 'lead', target_id: id, body: 'Llamada hecha, pide ver casas el sábado.',
    }), sinParams)

    expect(res.status).toBe(201)
    expect((await res.json()).lead_id).toBe(id)

    const { data: despues } = await admin.from('leads').select('current_score').eq('id', id).single()
    expect(despues!.current_score).toBe(antes!.current_score)
  })

  it('acepta target_type contact resolviendo al mismo lead', async () => {
    const { POST } = await import('@/app/api/agent/v1/notes/route')
    const res = await POST(post('http://x/agent/v1/notes', {
      target_type: 'contact', target_id: creados[0], body: 'Nota por contacto.',
    }), sinParams)

    expect(res.status).toBe(201)
    expect((await res.json()).lead_id).toBe(creados[0])
  })

  it('un target inexistente devuelve 404', async () => {
    const { POST } = await import('@/app/api/agent/v1/notes/route')
    const res = await POST(post('http://x/agent/v1/notes', {
      target_type: 'lead', target_id: 'no-existe', body: 'x',
    }), sinParams)
    expect(res.status).toBe(404)
  })
})

describe('POST /agent/v1/emails/draft', () => {
  it('persiste el cuerpo literal que manda el cliente y NO envía', async () => {
    const { POST } = await import('@/app/api/agent/v1/emails/draft/route')
    const cuerpo = 'Hola Nuevo,\n\nTe comparto tres opciones.\n\nUn saludo.'

    const res = await POST(post('http://x/agent/v1/emails/draft', {
      lead_id: creados[0], subject: 'Tres opciones para tu búsqueda', body: cuerpo,
    }), sinParams)

    expect(res.status).toBe(201)
    const body = await res.json()

    expect(body.body).toBe(cuerpo)          // literal, sin reescribir
    expect(body.status).toBe('draft')

    // Nada salió: ni envío registrado ni corrida de secuencia.
    const { count } = await admin.from('email_sends')
      .select('*', { count: 'exact', head: true }).eq('lead_id', creados[0])
    expect(count).toBe(0)
  })

  it('un lead inexistente devuelve 404', async () => {
    const { POST } = await import('@/app/api/agent/v1/emails/draft/route')
    const res = await POST(post('http://x/agent/v1/emails/draft', {
      lead_id: 'no-existe', subject: 'x', body: 'y',
    }), sinParams)
    expect(res.status).toBe(404)
  })
})
