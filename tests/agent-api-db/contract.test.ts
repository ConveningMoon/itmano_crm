/**
 * Genera y vigila los dos entregables del contrato:
 *
 *   src/lib/agent-api/openapi.generated.json  ← lo sirve GET /agent/v1/openapi.json
 *   docs/agent-api/openapi.json               ← copia commiteada, idéntica
 *   docs/agent-api/demo-tenant.json           ← export offline del tenant demo
 *
 *   npm run openapi:gen     regenera los tres
 *   npm run test:agent-api  falla si el commiteado se separó del código
 *
 * Los ejemplos y el export NO se sacan de la base: se obtienen LLAMANDO a los
 * endpoints de lectura, así que no pueden divergir de lo que la API devuelve.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { buildOpenApiDocument } from '@/lib/agent-api/openapi'
import { ROUTES } from '@/lib/agent-api/registry'

// eslint-disable-next-line @typescript-eslint/no-require-imports
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws') as typeof WebSocket

const REGENERAR = process.env.UPDATE_OPENAPI === '1'
const TENANT    = 'tenant-conduit-demo'

const RUTA_SERVIDA    = 'src/lib/agent-api/openapi.generated.json'
const RUTA_DOCS       = 'docs/agent-api/openapi.json'
const RUTA_EXPORT     = 'docs/agent-api/demo-tenant.json'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const TOKEN = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const hash  = (t: string) => createHash('sha256').update(t).digest('hex')

const sinParams = { params: Promise.resolve({} as Record<string, string>) }
const conId = (id: string) => ({ params: Promise.resolve({ id }) })
const pedir = (url: string) => new Request(url, { headers: { Authorization: `Bearer ${TOKEN}` } })

async function llamar(
  modulo: Promise<{ GET: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response> }>,
  url: string,
  ctx = sinParams,
): Promise<unknown> {
  const { GET } = await modulo
  const res = await GET(pedir(url), ctx)
  if (res.status !== 200) throw new Error(`${url} devolvió ${res.status}: ${await res.text()}`)
  return res.json()
}

let ejemplos: Record<string, unknown> = {}
let exportado: Record<string, unknown> = {}

beforeAll(async () => {
  const { data: bot } = await admin
    .from('user_profiles').select('id').eq('tenant_id', TENANT).limit(1).single()

  await admin.from('agent_tokens').insert({
    tenant_id: TENANT, name: 'generador de contrato', token_prefix: TOKEN.slice(0, 25),
    token_hash: hash(TOKEN), scopes: ['read'], bot_user_id: bot!.id as string,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

  const whoami   = await llamar(import('@/app/api/agent/v1/whoami/route'), 'http://x/agent/v1/whoami')
  const metadata = await llamar(import('@/app/api/agent/v1/metadata/route'), 'http://x/agent/v1/metadata')
  const leads    = await llamar(import('@/app/api/agent/v1/leads/route'), 'http://x/agent/v1/leads?limit=3')
  const contacts = await llamar(import('@/app/api/agent/v1/contacts/route'), 'http://x/agent/v1/contacts?limit=3')
  const deals    = await llamar(import('@/app/api/agent/v1/deals/route'), 'http://x/agent/v1/deals?limit=3')
  const search   = await llamar(import('@/app/api/agent/v1/search/route'), 'http://x/agent/v1/search?q=a&limit=3')

  const idLead = (leads as { data: { id: string }[] }).data[0].id
  const idDeal = (deals as { data: { id: string }[] }).data[0].id

  const lead    = await llamar(import('@/app/api/agent/v1/leads/[id]/route'), `http://x/agent/v1/leads/${idLead}`, conId(idLead))
  const contact = await llamar(import('@/app/api/agent/v1/contacts/[id]/route'), `http://x/agent/v1/contacts/${idLead}`, conId(idLead))
  const deal    = await llamar(import('@/app/api/agent/v1/deals/[id]/route'), `http://x/agent/v1/deals/${idDeal}`, conId(idDeal))

  // El vencimiento del token cambia en cada corrida; si viajara al ejemplo, la
  // guarda de deriva no podría pasar dos veces seguidas. Se fija un valor
  // ilustrativo y el resto del ejemplo sigue siendo la respuesta real.
  const whoamiEstable = {
    ...(whoami as Record<string, unknown>),
    token: { expires_at: '2026-11-15T00:00:00.000Z' },
  }

  ejemplos = {
    whoami: whoamiEstable, metadata, leads, contacts, deals, search, lead, contact, deal,
    // Las escrituras devuelven la misma forma que su lectura equivalente, así
    // que reutilizan el ejemplo en vez de crear filas sólo para documentar.
    note:  { id: '9f1c...', lead_id: idLead, body: 'Llamada hecha; pide ver casas el sábado.', created_at: '2026-08-01T15:04:05.000Z' },
    draft: { id: '4ad2...', lead_id: idLead, subject: 'Tres opciones para tu búsqueda', body: 'Hola…', created_at: '2026-08-01T15:04:05.000Z', status: 'draft' },
  }

  // Export offline: páginas COMPLETAS, siguiendo el cursor hasta el final.
  async function todo(modulo: Parameters<typeof llamar>[0], base: string) {
    const filas: unknown[] = []
    let cursor: string | null = null
    do {
      const url: string = `${base}${base.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const pagina = await llamar(modulo, url) as { data: unknown[]; next_cursor: string | null }
      filas.push(...pagina.data)
      cursor = pagina.next_cursor
    } while (cursor)
    return filas
  }

  exportado = {
    generado_el: '2026-08-12',
    tenant: (whoami as { tenant: unknown }).tenant,
    aviso: 'Datos 100% sintéticos del tenant demo. Todos los correos son @example.com.',
    metadata,
    leads:    await todo(import('@/app/api/agent/v1/leads/route'), 'http://x/agent/v1/leads'),
    contacts: await todo(import('@/app/api/agent/v1/contacts/route'), 'http://x/agent/v1/contacts'),
    deals:    await todo(import('@/app/api/agent/v1/deals/route'), 'http://x/agent/v1/deals'),
  }
})

afterAll(async () => {
  await admin.from('agent_tokens').delete().eq('token_hash', hash(TOKEN))
})

describe('contrato OpenAPI', () => {
  it('se genera desde el registro y coincide con el archivo commiteado', () => {
    const doc = JSON.stringify(buildOpenApiDocument(ejemplos), null, 2) + '\n'

    if (REGENERAR) {
      mkdirSync('docs/agent-api', { recursive: true })
      writeFileSync(RUTA_SERVIDA, doc)
      writeFileSync(RUTA_DOCS, doc)
      writeFileSync(RUTA_EXPORT, JSON.stringify(exportado, null, 2) + '\n')
      console.log(`Regenerados ${RUTA_SERVIDA}, ${RUTA_DOCS} y ${RUTA_EXPORT}`)
    }

    expect(readFileSync(RUTA_DOCS, 'utf8')).toBe(doc)
  })

  it('lo servido y lo commiteado son el mismo documento', () => {
    expect(readFileSync(RUTA_SERVIDA, 'utf8')).toBe(readFileSync(RUTA_DOCS, 'utf8'))
  })

  it('toda operación declara x-itmano-agent-tool', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    for (const [ruta, ops] of Object.entries<Record<string, { 'x-itmano-agent-tool'?: unknown }>>(doc.paths)) {
      for (const [verbo, op] of Object.entries(ops)) {
        expect(typeof op['x-itmano-agent-tool'], `${verbo} ${ruta}`).toBe('boolean')
      }
    }
  })

  it('contacts queda fuera del catálogo de herramientas', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    expect(doc.paths['/agent/v1/contacts'].get['x-itmano-agent-tool']).toBe(false)
    expect(doc.paths['/agent/v1/contacts/{id}'].get['x-itmano-agent-tool']).toBe(false)
    expect(doc.paths['/agent/v1/leads'].get['x-itmano-agent-tool']).toBe(true)
  })

  it('no hay ninguna operación DELETE', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    for (const ops of Object.values<Record<string, unknown>>(doc.paths)) {
      expect(Object.keys(ops)).not.toContain('delete')
    }
  })

  it('los campos personales llegan marcados con x-itmano-pii', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    const lead = doc.paths['/agent/v1/leads/{id}'].get.responses['200'].content['application/json'].schema

    for (const campo of ['first_name', 'last_name', 'email', 'phone', 'notes']) {
      expect(lead.properties[campo]['x-itmano-pii'], campo).toBe(true)
    }
    for (const campo of ['id', 'stage', 'created_at']) {
      expect(lead.properties[campo]['x-itmano-pii'], campo).toBeUndefined()
    }
  })

  it('cada ruta del registro aparece en el documento', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    for (const ruta of ROUTES) {
      expect(doc.paths[`/agent/v1${ruta.path}`]?.[ruta.method], `${ruta.method} ${ruta.path}`).toBeDefined()
    }
  })

  it('las escrituras documentan Idempotency-Key', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    const post = doc.paths['/agent/v1/leads'].post
    const nombres = post.parameters.map((p: { name: string }) => p.name)
    expect(nombres).toContain('Idempotency-Key')
    expect(post.responses['409']).toBeDefined()
  })

  it('los ejemplos salen del tenant demo y no llevan datos reales', () => {
    const doc = JSON.parse(readFileSync(RUTA_DOCS, 'utf8'))
    const ejemplo = doc.paths['/agent/v1/leads'].get.responses['200'].content['application/json'].example

    expect(ejemplo.data.length).toBeGreaterThan(0)
    for (const lead of ejemplo.data) expect(lead.email).toMatch(/@example\.com$/)
  })
})

describe('export offline del tenant demo', () => {
  it('trae la cartera completa', () => {
    const datos = JSON.parse(readFileSync(RUTA_EXPORT, 'utf8'))
    expect(datos.leads).toHaveLength(60)
    expect(datos.contacts).toHaveLength(60)
    expect(datos.deals).toHaveLength(25)
  })

  it('no contiene un solo correo fuera de example.com', () => {
    const crudo = readFileSync(RUTA_EXPORT, 'utf8')
    const correos = crudo.match(/[\w.+-]+@[\w.-]+/g) ?? []
    expect(correos.length).toBeGreaterThan(0)
    for (const correo of correos) expect(correo).toMatch(/@example\.com$/)
  })

  it('incluye los casos raros que necesita el adapter', () => {
    const datos = JSON.parse(readFileSync(RUTA_EXPORT, 'utf8'))

    expect(datos.deals.some((d: { close_date: string | null }) => d.close_date === null)).toBe(true)
    expect(datos.deals.every((d: { amount: unknown }) => d.amount === null)).toBe(true)
    expect(datos.deals.some((d: { lead_stage: string }) => d.lead_stage === 'perdido')).toBe(true)
    expect(datos.leads.some((l: { budget: unknown }) => l.budget === null)).toBe(true)
    expect(datos.leads.some((l: { phone: string | null }) => l.phone === null)).toBe(true)

    const etapas = new Set(datos.leads.map((l: { stage: string }) => l.stage))
    expect(etapas.size).toBe(5)
  })
})
