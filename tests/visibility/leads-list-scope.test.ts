import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { VisibilityScope } from '@/lib/auth/visibility'
import type { LeadListFilters } from '@/lib/leads/list-filters'

// La lista de leads se pagina en el servidor: estas pruebas fijan que el scope de
// visibilidad (tenant + agente) se sigue aplicando EN LA QUERY, no en JavaScript
// sobre un listado ya traído — que es justo lo que esta refactorización eliminó.

interface Call { method: string; args: unknown[] }
interface RecordedQuery { table: string; calls: Call[] }

let queries: RecordedQuery[] = []
let mockCount = 0
let mockRows: unknown[] = []

function fakeQuery(record: RecordedQuery): unknown {
  const q: unknown = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      // Thenable: `await query` resuelve como lo haría PostgREST.
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: mockRows, count: mockCount, error: null })
      }
      return (...args: unknown[]) => { record.calls.push({ method: prop, args }); return q }
    },
  })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const record: RecordedQuery = { table, calls: [] }
      queries.push(record)
      return fakeQuery(record)
    },
  }),
}))

const { getLeadsListData } = await import('@/lib/data/leads')

const SUPER: VisibilityScope = { tenantId: null,        agentId: null }
const OWNER: VisibilityScope = { tenantId: 'tenant-aj', agentId: null }
const AGENT: VisibilityScope = { tenantId: 'tenant-aj', agentId: 'agent-dylan' }

const BASE: LeadListFilters = {
  q: '', agentId: 'all', stage: 'all', source: 'all', channelId: 'all',
  language: 'all', quality: 'all', sort: 'recientes', view: 'table', page: 1,
}

const CHANNELS = [
  { id: 'ch-lm-1', channelType: 'lead_magnet' },
  { id: 'ch-ev-1', channelType: 'event' },
]

function eqCalls(q: RecordedQuery): Array<[string, unknown]> {
  return q.calls.filter(c => c.method === 'eq').map(c => [c.args[0] as string, c.args[1]])
}

function callsOf(q: RecordedQuery, method: string): Call[] {
  return q.calls.filter(c => c.method === method)
}

beforeEach(() => {
  queries = []
  mockCount = 0
  mockRows = []
})

describe('getLeadsListData — scope de visibilidad', () => {
  it('agent_owner: toda query lleva tenant_id y ninguna lleva agent_id', async () => {
    await getLeadsListData(OWNER, BASE, CHANNELS)

    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q.table).toBe('leads_list')
      expect(eqCalls(q)).toContainEqual(['tenant_id', 'tenant-aj'])
      expect(eqCalls(q).map(([col]) => col)).not.toContain('agent_id')
    }
  })

  it("rol 'agent': toda query lleva tenant_id Y agent_id", async () => {
    await getLeadsListData(AGENT, BASE, CHANNELS)

    for (const q of queries) {
      expect(eqCalls(q)).toContainEqual(['tenant_id', 'tenant-aj'])
      expect(eqCalls(q)).toContainEqual(['agent_id', 'agent-dylan'])
    }
  })

  it('super_admin: sin filtro de tenant (ve todos los tenants)', async () => {
    await getLeadsListData(SUPER, BASE, CHANNELS)

    for (const q of queries) {
      expect(eqCalls(q).map(([col]) => col)).not.toContain('tenant_id')
    }
  })

  it('el conteo total también va acotado: nunca cuenta leads de otro tenant', async () => {
    mockCount = 42
    const data = await getLeadsListData(AGENT, BASE, CHANNELS)

    const countQueries = queries.filter(q => callsOf(q, 'select').some(c => {
      const opts = c.args[1] as { count?: string; head?: boolean } | undefined
      return opts?.count === 'exact'
    }))
    expect(countQueries.length).toBeGreaterThan(0)
    for (const q of countQueries) {
      expect(eqCalls(q)).toContainEqual(['agent_id', 'agent-dylan'])
    }
    expect(data.total).toBe(42)
  })
})

describe('getLeadsListData — paginación y filtros en la query', () => {
  it('la página se pide con .range() sobre el tamaño de página', async () => {
    mockCount = 100
    await getLeadsListData(OWNER, { ...BASE, page: 3 }, CHANNELS)

    const ranges = queries.flatMap(q => callsOf(q, 'range')).map(c => c.args)
    expect(ranges).toEqual([[40, 59]])
  })

  it('una página fuera de rango cae a la última real', async () => {
    mockCount = 25  // 2 páginas
    const data = await getLeadsListData(OWNER, { ...BASE, page: 99 }, CHANNELS)

    expect(data.page).toBe(2)
    expect(queries.flatMap(q => callsOf(q, 'range')).map(c => c.args)).toEqual([[20, 39]])
  })

  it('la búsqueda va como ilike sobre search_text, en minúsculas y escapada', async () => {
    await getLeadsListData(OWNER, { ...BASE, q: '100% Juan_' }, CHANNELS)

    const ilikes = queries.flatMap(q => callsOf(q, 'ilike')).map(c => c.args)
    expect(ilikes.length).toBeGreaterThan(0)
    for (const args of ilikes) {
      expect(args).toEqual(['search_text', '%100\\% juan\\_%'])
    }
  })

  it('el filtro de etapa va a la query, no a un .filter() en JS', async () => {
    await getLeadsListData(OWNER, { ...BASE, stage: 'cerrado' }, CHANNELS)

    for (const q of queries.slice(0, 2)) {
      expect(eqCalls(q)).toContainEqual(['stage', 'cerrado'])
    }
  })

  it('el filtro de fuente compuesto se traduce a un .or() sobre canal + traffic_source', async () => {
    await getLeadsListData(OWNER, { ...BASE, source: 'manual' }, [
      ...CHANNELS, { id: 'ch-man', channelType: 'manual' },
    ])

    const ors = queries.flatMap(q => callsOf(q, 'or')).map(c => c.args[0] as string)
    expect(ors.length).toBeGreaterThan(0)
    expect(ors[0]).toContain('acquisition_channel_id.in.(ch-man)')
    expect(ors[0]).toContain('and(acquisition_channel_id.is.null,traffic_source.in.(direct))')
  })

  it('una fuente imposible no toca la tabla de leads', async () => {
    const data = await getLeadsListData(OWNER, { ...BASE, source: 'event' }, [])

    expect(data.total).toBe(0)
    expect(data.items).toEqual([])
    // Sólo queda el conteo de "para hoy", que no depende del filtro de fuente.
    expect(queries.length).toBe(1)
  })

  it('el orden "prioridad" ordena en la base, no en el cliente', async () => {
    await getLeadsListData(OWNER, { ...BASE, sort: 'prioridad' }, CHANNELS)

    const orders = queries.flatMap(q => callsOf(q, 'order')).map(c => c.args[0] as string)
    expect(orders).toContain('urgency_rank')
    expect(orders).toContain('quality_score')
  })

  it('sólo pide columnas que la vista expone de verdad', async () => {
    // El fallo que esto habría atrapado: la 082 quitó attention_when de
    // leads_list y el select siguió pidiéndola, asi que /leads dejó de cargar.
    // tsc no ve nombres de columnas SQL y el resto de tests mockea el cliente.
    await getLeadsListData(OWNER, BASE, CHANNELS)

    const cols = queries
      .flatMap(q => callsOf(q, 'select'))
      .map(c => c.args[0] as string)
      .filter(c => c && c !== 'id')
      .flatMap(c => c.split(',').map(x => x.trim()))
    const EXPUESTAS = new Set([
      'id', 'agent_id', 'acquisition_channel_id', 'traffic_source', 'first_name',
      'last_name', 'email', 'phone', 'language', 'current_score', 'created_at',
      'stage', 'quality_band', 'urgency', 'urgency_rank', 'quality_score',
    ])
    for (const c of cols) expect(EXPUESTAS.has(c)).toBe(true)
  })
})

describe('getLeadsListData — kanban', () => {
  it('cada columna es su propia query acotada, con tope y conteo real', async () => {
    mockCount = 7
    const data = await getLeadsListData(OWNER, { ...BASE, view: 'kanban' }, CHANNELS)

    // Una columna por etapa (5), cada una filtrando por .eq('stage', ...).
    const columnQueries = queries.filter(q =>
      eqCalls(q).some(([col]) => col === 'stage'),
    )
    expect(columnQueries).toHaveLength(5)

    const cerrado = columnQueries.find(q =>
      eqCalls(q).some(([col, val]) => col === 'stage' && val === 'cerrado'),
    )
    expect(cerrado).toBeDefined()
    expect(callsOf(cerrado!, 'limit')[0].args).toEqual([50])
    expect(eqCalls(cerrado!)).toContainEqual(['tenant_id', 'tenant-aj'])

    expect(data.kanban).toHaveLength(5)
    expect(data.kanban?.every(c => c.total === 7)).toBe(true)
  })

  it('un filtro de etapa deja vacías las demás columnas', async () => {
    const data = await getLeadsListData(OWNER, { ...BASE, view: 'kanban', stage: 'cerrado' }, CHANNELS)

    // Sólo la columna 'cerrado' consulta; el resto se resuelve sin ir a la base.
    // Se identifican por el .limit() del tope de tarjetas: los dos conteos de la
    // cabecera también filtran por etapa, pero no paginan.
    const columnQueries = queries.filter(q =>
      eqCalls(q).some(([col]) => col === 'stage') && callsOf(q, 'limit').length > 0,
    )
    expect(columnQueries).toHaveLength(1)
    expect(data.kanban?.filter(c => c.key !== 'cerrado').every(c => c.total === 0 && c.items.length === 0)).toBe(true)
  })
})
