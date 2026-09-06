/**
 * Integración de /deals y /search contra el SANDBOX real.
 * Crea sus propios leads y procesos, y los borra al terminar.
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

const TOKEN = 'itmano_agent_sbx_' + randomBytes(24).toString('base64url')
const hash  = (t: string) => createHash('sha256').update(t).digest('hex')

const LEAD_CERRADO = 'test-agentapi-lead-cerrado'
const LEAD_PERDIDO = 'test-agentapi-lead-perdido'
const LEAD_SIN_BUD = 'test-agentapi-lead-sin-budget'
const LEADS = [LEAD_CERRADO, LEAD_PERDIDO, LEAD_SIN_BUD]

const sinParams = { params: Promise.resolve({} as Record<string, string>) }
const conId = (id: string) => ({ params: Promise.resolve({ id }) })
const pedir = (url: string) => new Request(url, { headers: { Authorization: `Bearer ${TOKEN}` } })

let tenantId: string
let idProcesoConFecha = ''
let idProcesoSinFecha = ''

beforeAll(async () => {
  const { data: perfil } = await admin
    .from('user_profiles').select('id, tenant_id').not('tenant_id', 'is', null).limit(1).single()
  tenantId = perfil!.tenant_id as string

  await admin.from('agent_tokens').insert({
    tenant_id: tenantId, name: 'test deals', token_prefix: TOKEN.slice(0, 25),
    token_hash: hash(TOKEN), scopes: ['read'], bot_user_id: perfil!.id as string,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })

  const { error: errLeads } = await admin.from('leads').insert([
    // budget_amount es GENERATED ALWAYS desde metadata->'budget_amount', y solo
    // cuenta si el valor JSON es de tipo number. No se puede insertar directo.
    { id: LEAD_CERRADO, tenant_id: tenantId, agent_id: 'agent-ana-torres', first_name: 'Cerrado', last_name: 'Prueba',
      email: 'cerrado.prueba@example.com', language: 'es', stage: 'cerrado', metadata: { budget_amount: 500000 } },
    { id: LEAD_PERDIDO, tenant_id: tenantId, agent_id: 'agent-ana-torres', first_name: 'Perdido', last_name: 'Prueba',
      email: 'perdido.prueba@example.com', language: 'es', stage: 'perdido', metadata: { budget_amount: 200000 } },
    { id: LEAD_SIN_BUD, tenant_id: tenantId, agent_id: 'agent-ana-torres', first_name: 'SinBudget', last_name: 'Prueba',
      email: 'sinbudget.prueba@example.com', language: 'es', stage: 'en_proceso', metadata: {} },
  ])
  if (errLeads) throw new Error(`setup: insert de leads falló: ${errLeads.message}`)

  const { data: procesos, error: errProc } = await admin.from('purchase_processes').insert([
    { tenant_id: tenantId, lead_id: LEAD_CERRADO, address: '9 Test Ave', loan_type: 'conventional',
      closing_date: '2026-04-10',
      email_start_sent: true, email_preclose_sent: true, email_completed_sent: true },
    { tenant_id: tenantId, lead_id: LEAD_PERDIDO, address: '10 Test Ave', loan_type: 'fha',
      closing_date: null,
      email_start_sent: true, email_preclose_sent: true, email_completed_sent: true },
    { tenant_id: tenantId, lead_id: LEAD_SIN_BUD, address: '11 Test Ave', loan_type: 'va',
      closing_date: '2026-09-01',
      email_start_sent: true, email_preclose_sent: true, email_completed_sent: true },
  ]).select('id, closing_date')
  if (errProc) throw new Error(`setup: insert de procesos falló: ${errProc.message}`)

  idProcesoConFecha = (procesos ?? []).find(p => p.closing_date === '2026-04-10')!.id as string
  idProcesoSinFecha = (procesos ?? []).find(p => p.closing_date === null)!.id as string
})

afterAll(async () => {
  await admin.from('purchase_processes').delete().in('lead_id', LEADS)
  await admin.from('lead_events').delete().in('lead_id', LEADS)
  await admin.from('leads').delete().in('id', LEADS)
  await admin.from('agent_tokens').delete().eq('token_hash', hash(TOKEN))
})

describe('GET /agent/v1/deals', () => {
  it('amount es null en TODOS los deals: no hay importe que inventar', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/route')
    const body = await (await GET(pedir('http://x/agent/v1/deals?limit=50'), sinParams)).json()

    expect(body.data.length).toBeGreaterThan(0)
    for (const d of body.data) expect(d.amount).toBeNull()
  })

  it('los campos prestados llevan el valor del lead dueño', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/[id]/route')
    const body = await (await GET(
      pedir(`http://x/agent/v1/deals/${idProcesoConFecha}`), conId(idProcesoConFecha))).json()

    expect(body.lead_stage).toBe('cerrado')
    expect(body.lead_budget_amount).toEqual({ amount: '500000.00', currency: 'USD' })
    expect(body.pipeline).toBe('compra')
    expect(body.close_date).toBe('2026-04-10')
  })

  it('un deal cuyo lead está perdido lo refleja sin ocultarlo', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/[id]/route')
    const body = await (await GET(
      pedir(`http://x/agent/v1/deals/${idProcesoSinFecha}`), conId(idProcesoSinFecha))).json()

    expect(body.lead_stage).toBe('perdido')
    expect(body.close_date).toBeNull()
  })

  it('close_before EXCLUYE los procesos sin fecha de cierre', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/route')
    const body = await (await GET(
      pedir('http://x/agent/v1/deals?close_before=2026-12-31&limit=50'), sinParams)).json()

    const ids = body.data.map((d: { id: string }) => d.id)
    expect(ids).toContain(idProcesoConFecha)
    expect(ids).not.toContain(idProcesoSinFecha)
  })

  it('filtra por la etapa del lead dueño', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/route')
    const body = await (await GET(
      pedir('http://x/agent/v1/deals?lead_stage=perdido&limit=50'), sinParams)).json()

    for (const d of body.data) expect(d.lead_stage).toBe('perdido')
    expect(body.data.map((d: { id: string }) => d.id)).toContain(idProcesoSinFecha)
  })

  it('min_lead_budget filtra por el presupuesto del lead, no por un importe del deal', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/route')
    const body = await (await GET(
      pedir('http://x/agent/v1/deals?min_lead_budget=300000&limit=50'), sinParams)).json()

    const ids = body.data.map((d: { id: string }) => d.id)
    expect(ids).toContain(idProcesoConFecha)      // 500.000
    expect(ids).not.toContain(idProcesoSinFecha)  // 200.000
  })

  it('rechaza un pipeline que no existe', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/route')
    const res = await GET(pedir('http://x/agent/v1/deals?pipeline=ventas'), sinParams)
    expect(res.status).toBe(400)
  })

  it('un id inexistente devuelve 404', async () => {
    const { GET } = await import('@/app/api/agent/v1/deals/[id]/route')
    const id = '00000000-0000-4000-8000-000000000000'
    const res = await GET(pedir(`http://x/agent/v1/deals/${id}`), conId(id))
    expect(res.status).toBe(404)
  })
})

describe('GET /agent/v1/search', () => {
  it('encuentra un lead por nombre y devuelve tipo, id y etiqueta', async () => {
    const { GET } = await import('@/app/api/agent/v1/search/route')
    const body = await (await GET(pedir('http://x/agent/v1/search?q=SinBudget'), sinParams)).json()

    const hit = body.data.find((h: { id: string }) => h.id === LEAD_SIN_BUD)
    expect(hit).toBeDefined()
    expect(hit.type).toBe('lead')
    expect(hit.label).toContain('SinBudget')
  })

  it('encuentra deals por dirección', async () => {
    const { GET } = await import('@/app/api/agent/v1/search/route')
    const body = await (await GET(pedir('http://x/agent/v1/search?q=Test Ave'), sinParams)).json()

    expect(body.data.some((h: { type: string }) => h.type === 'deal')).toBe(true)
  })

  it('una búsqueda con coma no rompe el filtro', async () => {
    const { GET } = await import('@/app/api/agent/v1/search/route')
    const res = await GET(pedir('http://x/agent/v1/search?q=' + encodeURIComponent('Test, Ave')), sinParams)
    expect(res.status).toBe(200)
  })

  it('exige q', async () => {
    const { GET } = await import('@/app/api/agent/v1/search/route')
    const res = await GET(pedir('http://x/agent/v1/search'), sinParams)
    expect(res.status).toBe(400)
  })
})
