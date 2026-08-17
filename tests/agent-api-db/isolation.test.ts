/**
 * Aislamiento por tenant. Es la regla 1 del contrato con CONDUIT: un token del
 * tenant A que pide un registro del tenant B recibe 404, nunca 403, porque no
 * se filtra existencia.
 *
 * Crea un segundo tenant completo y lo borra al terminar.
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

const TOKEN_A = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

const TENANT_B = 'test-agentapi-tenant-b'
const AGENT_B  = 'test-agentapi-agent-b'
const LEAD_B   = 'test-agentapi-lead-b'

const sinParams = { params: Promise.resolve({} as Record<string, string>) }
const conId = (id: string) => ({ params: Promise.resolve({ id }) })
const pedir = (url: string) => new Request(url, { headers: { Authorization: `Bearer ${TOKEN_A}` } })

let tenantA: string

beforeAll(async () => {
  const { data: perfil } = await admin
    .from('user_profiles').select('id, tenant_id').not('tenant_id', 'is', null).limit(1).single()
  tenantA = perfil!.tenant_id as string

  await admin.from('agent_tokens').insert({
    tenant_id: tenantA, name: 'test aislamiento', token_prefix: TOKEN_A.slice(0, 25),
    token_hash: hash(TOKEN_A), scopes: ['read', 'write'], bot_user_id: perfil!.id as string,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

  await admin.from('tenants').insert({
    id: TENANT_B, name: 'Tenant B de prueba', slug: 'tenant-b-prueba', currency: 'USD',
  })
  const { error: errAgente } = await admin.from('agents').insert({
    id: AGENT_B, tenant_id: TENANT_B, name: 'Agente B', email: 'agente.b@example.com',
    language: 'es', languages: ['es'], avatar_initials: 'AB', accent_color: '#888888',
  })
  if (errAgente) throw new Error(`setup agente: ${errAgente.message}`)
  const { error } = await admin.from('leads').insert({
    id: LEAD_B, tenant_id: TENANT_B, agent_id: AGENT_B,
    first_name: 'Secreto', last_name: 'DelTenantB',
    email: 'secreto.tenantb@example.com', language: 'es', stage: 'nuevo',
  })
  if (error) throw new Error(`setup: ${error.message}`)
})

afterAll(async () => {
  await admin.from('lead_events').delete().eq('tenant_id', TENANT_B)
  await admin.from('leads').delete().eq('tenant_id', TENANT_B)
  await admin.from('agents').delete().eq('tenant_id', TENANT_B)
  await admin.from('tenants').delete().eq('id', TENANT_B)
  await admin.from('agent_tokens').delete().eq('token_hash', hash(TOKEN_A))
})

describe('aislamiento por tenant', () => {
  it('el lead del tenant B existe de verdad en la base', async () => {
    const { data } = await admin.from('leads').select('id').eq('id', LEAD_B).maybeSingle()
    expect(data?.id).toBe(LEAD_B)   // si no, el resto de la prueba no valdría nada
  })

  it('pedirlo por id con un token del tenant A devuelve 404, no 403', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await GET(pedir(`http://x/agent/v1/leads/${LEAD_B}`), conId(LEAD_B))

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })

  it('el 404 es indistinguible del de un id que no existe en ninguna parte', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/[id]/route')

    const ajeno = await (await GET(pedir(`http://x/agent/v1/leads/${LEAD_B}`), conId(LEAD_B))).json()
    const inventado = await (await GET(pedir('http://x/agent/v1/leads/no-existe'), conId('no-existe'))).json()

    expect(ajeno.error.code).toBe(inventado.error.code)
    expect(ajeno.error.retryable).toBe(inventado.error.retryable)
  })

  it('no aparece en el listado', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const body = await (await GET(pedir('http://x/agent/v1/leads?limit=100'), sinParams)).json()

    expect(body.data.map((l: { id: string }) => l.id)).not.toContain(LEAD_B)
  })

  it('no aparece en la búsqueda transversal', async () => {
    const { GET } = await import('@/app/api/agent/v1/search/route')
    const body = await (await GET(pedir('http://x/agent/v1/search?q=Secreto'), sinParams)).json()

    expect(body.data.map((h: { id: string }) => h.id)).not.toContain(LEAD_B)
  })

  it('su agente no aparece entre los owners de /metadata', async () => {
    const { GET } = await import('@/app/api/agent/v1/metadata/route')
    const body = await (await GET(pedir('http://x/agent/v1/metadata'), sinParams)).json()

    expect(body.owners.map((o: { id: string }) => o.id)).not.toContain(AGENT_B)
  })

  it('no se puede escribirle una nota', async () => {
    const { POST } = await import('@/app/api/agent/v1/notes/route')
    const res = await POST(new Request('http://x/agent/v1/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({ target_type: 'lead', target_id: LEAD_B, body: 'no debería entrar' }),
    }), sinParams)

    expect(res.status).toBe(404)

    const { count } = await admin.from('lead_events')
      .select('*', { count: 'exact', head: true }).eq('lead_id', LEAD_B)
    expect(count).toBe(0)
  })

  it('no se puede moverle la etapa', async () => {
    const { PATCH } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await PATCH(new Request(`http://x/agent/v1/leads/${LEAD_B}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'perdido' }),
    }), conId(LEAD_B))

    expect(res.status).toBe(404)

    const { data } = await admin.from('leads').select('stage').eq('id', LEAD_B).single()
    expect(data!.stage).toBe('nuevo')   // intacto
  })

  it('no se le puede asignar un lead propio a un agente del otro tenant', async () => {
    const { POST } = await import('@/app/api/agent/v1/leads/route')
    const res = await POST(new Request('http://x/agent/v1/leads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN_A}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Fuga', last_name: 'Cruzada',
        email: 'fuga.cruzada@example.com', owner: AGENT_B,
      }),
    }), sinParams)

    expect(res.status).toBe(422)
    await admin.from('leads').delete().eq('email', 'fuga.cruzada@example.com')
  })
})
