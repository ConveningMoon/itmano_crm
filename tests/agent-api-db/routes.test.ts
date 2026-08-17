/**
 * Integración contra el SANDBOX real. No entra en test:unit: pega a la base.
 *   npm run test:agent-api
 *
 * Invoca los route handlers directamente con un Request, que ejercita la cadena
 * completa — autenticación, minteo de JWT, RLS, rate limit, serialización — sin
 * necesitar un servidor levantado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY!

// realtime-js exige un constructor de WebSocket al construir CUALQUIER cliente,
// aunque no se use Realtime, y bajo vitest no encuentra el global. El polyfill
// va en globalThis (no como opción por cliente) porque los clientes que importan
// son los que crea el propio código bajo prueba, dentro de auth.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws') as typeof WebSocket

const admin = createClient(URL_SB, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TOKEN_LECTURA  = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const TOKEN_SIN_SCOPE = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

const sinParams = { params: Promise.resolve({} as Record<string, string>) }
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

const pedir = (url: string, token: string) =>
  new Request(url, { headers: { Authorization: `Bearer ${token}` } })

let tenantId: string
let botUserId: string

beforeAll(async () => {
  const { data: perfil } = await admin
    .from('user_profiles').select('id, tenant_id').not('tenant_id', 'is', null).limit(1).single()

  botUserId = perfil!.id as string
  tenantId  = perfil!.tenant_id as string

  await admin.from('agent_tokens').insert([
    {
      tenant_id: tenantId, name: 'test lectura', token_prefix: TOKEN_LECTURA.slice(0, 25),
      token_hash: hash(TOKEN_LECTURA), scopes: ['read'], bot_user_id: botUserId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    },
    {
      tenant_id: tenantId, name: 'test sin scope', token_prefix: TOKEN_SIN_SCOPE.slice(0, 25),
      token_hash: hash(TOKEN_SIN_SCOPE), scopes: ['write'], bot_user_id: botUserId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    },
  ])
})

afterAll(async () => {
  await admin.from('agent_tokens').delete()
    .in('token_hash', [hash(TOKEN_LECTURA), hash(TOKEN_SIN_SCOPE)])
})

describe('GET /agent/v1/whoami', () => {
  it('devuelve el tenant del token sin tocar datos de negocio', async () => {
    const { GET } = await import('@/app/api/agent/v1/whoami/route')
    const res = await GET(pedir('http://x/agent/v1/whoami', TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tenant.id).toBe(tenantId)
    expect(body.scopes).toEqual(['read'])
    expect(body.api_version).toBe('v1')
  })

  it('sin token devuelve 401', async () => {
    const { GET } = await import('@/app/api/agent/v1/whoami/route')
    const res = await GET(new Request('http://x/agent/v1/whoami'), sinParams)
    expect(res.status).toBe(401)
  })

  it('un token inexistente devuelve 401, no 403', async () => {
    const { GET } = await import('@/app/api/agent/v1/whoami/route')
    const res = await GET(pedir('http://x/agent/v1/whoami', 'itmano_agent_sbx_noexiste'), sinParams)
    expect(res.status).toBe(401)
  })

  it('emite los headers de rate limit', async () => {
    const { GET } = await import('@/app/api/agent/v1/whoami/route')
    const res = await GET(pedir('http://x/agent/v1/whoami', TOKEN_LECTURA), sinParams)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('120')
    expect(Number(res.headers.get('X-RateLimit-Remaining'))).toBeLessThanOrEqual(120)
  })

  it('un token con scope write pero sin read no puede leer', async () => {
    const { GET } = await import('@/app/api/agent/v1/whoami/route')
    const res = await GET(pedir('http://x/agent/v1/whoami', TOKEN_SIN_SCOPE), sinParams)
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('insufficient_scope')
  })
})

describe('GET /agent/v1/metadata', () => {
  it('publica los enums vivos y declara custom_fields vacío', async () => {
    const { GET } = await import('@/app/api/agent/v1/metadata/route')
    const res = await GET(pedir('http://x/agent/v1/metadata', TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.map((s: { value: string }) => s.value))
      .toEqual(['nuevo', 'nutricion', 'en_proceso', 'cerrado', 'perdido'])
    expect(body.custom_fields).toEqual([])
    expect(body.pipelines).toEqual([{ value: 'compra', label: 'Compra' }])
    expect(body.currency).toBeTruthy()
    expect(body.fit_dimensions.buckets.timeline).toContain('under_3_months')
  })

  it('los owners que devuelve son agentes del tenant, no usuarios de login', async () => {
    const { GET } = await import('@/app/api/agent/v1/metadata/route')
    const body = await (await GET(pedir('http://x/agent/v1/metadata', TOKEN_LECTURA), sinParams)).json()
    expect(Array.isArray(body.owners)).toBe(true)
  })
})

describe('GET /agent/v1/leads', () => {
  it('devuelve una página con envelope y cursor', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const res = await GET(pedir('http://x/agent/v1/leads?limit=5', TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(5)
    expect(body).toHaveProperty('next_cursor')
  })

  it('los timestamps salen en ISO UTC con Z y no se filtra tenant_id', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const body = await (await GET(pedir('http://x/agent/v1/leads?limit=3', TOKEN_LECTURA), sinParams)).json()

    for (const lead of body.data) {
      expect(lead.created_at).toMatch(/Z$/)
      expect(lead).not.toHaveProperty('tenant_id')
    }
  })

  it('pagina con cursor sin repetir ni perder filas', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const vistos: string[] = []
    let cursor: string | null = null
    let vueltas = 0

    type Pagina = { data: { id: string }[]; next_cursor: string | null }

    do {
      const url: string =
        `http://x/agent/v1/leads?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const body = await (await GET(pedir(url, TOKEN_LECTURA), sinParams)).json() as Pagina
      vistos.push(...body.data.map(l => l.id))
      cursor = body.next_cursor
      vueltas++
    } while (cursor && vueltas < 20)

    expect(cursor).toBeNull()                       // llega al final
    expect(new Set(vistos).size).toBe(vistos.length) // sin duplicados
    expect(vueltas).toBeGreaterThan(1)               // hubo más de una página
  })

  it('un limit por encima del máximo es error, no un truncado silencioso', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const res = await GET(pedir('http://x/agent/v1/leads?limit=500', TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_arguments')
  })

  it('acepta status como alias de stage', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const res = await GET(pedir('http://x/agent/v1/leads?status=nuevo', TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(200)
    for (const lead of (await res.json()).data) expect(lead.stage).toBe('nuevo')
  })

  it('rechaza una etapa inventada', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const res = await GET(pedir('http://x/agent/v1/leads?stage=inventada', TOKEN_LECTURA), sinParams)
    expect(res.status).toBe(400)
  })

  it('un cursor de otra consulta se rechaza en vez de dar una página incoherente', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/route')
    const primera = await (await GET(pedir('http://x/agent/v1/leads?limit=2', TOKEN_LECTURA), sinParams)).json()

    const res = await GET(pedir(
      `http://x/agent/v1/leads?limit=2&stage=cerrado&cursor=${encodeURIComponent(primera.next_cursor)}`,
      TOKEN_LECTURA), sinParams)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_arguments')
  })
})

describe('GET /agent/v1/leads/{id}', () => {
  it('devuelve el lead pedido', async () => {
    const { GET: LISTA } = await import('@/app/api/agent/v1/leads/route')
    const primera = await (await LISTA(pedir('http://x/agent/v1/leads?limit=1', TOKEN_LECTURA), sinParams)).json()
    const id = primera.data[0].id

    const { GET } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await GET(pedir(`http://x/agent/v1/leads/${id}`, TOKEN_LECTURA), conId(id))

    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(id)
  })

  it('un id inexistente devuelve 404 sin revelar si existe en otro sitio', async () => {
    const { GET } = await import('@/app/api/agent/v1/leads/[id]/route')
    const res = await GET(pedir('http://x/agent/v1/leads/no-existe', TOKEN_LECTURA), conId('no-existe'))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
    expect(body.error.retryable).toBe(false)
  })
})

describe('GET /agent/v1/contacts', () => {
  it('devuelve los mismos ids que /leads pero sin scoring ni etapa', async () => {
    const { GET: LEADS } = await import('@/app/api/agent/v1/leads/route')
    const { GET: CONTACTOS } = await import('@/app/api/agent/v1/contacts/route')

    const leads = await (await LEADS(pedir('http://x/agent/v1/leads?limit=5', TOKEN_LECTURA), sinParams)).json()
    const contactos = await (await CONTACTOS(pedir('http://x/agent/v1/contacts?limit=5', TOKEN_LECTURA), sinParams)).json()

    expect(contactos.data.map((c: { id: string }) => c.id))
      .toEqual(leads.data.map((l: { id: string }) => l.id))

    for (const c of contactos.data) {
      expect(c).not.toHaveProperty('score')
      expect(c).not.toHaveProperty('stage')
      expect(c).toHaveProperty('email')
    }
  })
})
