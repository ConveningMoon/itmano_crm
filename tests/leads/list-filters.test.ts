import { describe, it, expect } from 'vitest'
import {
  parseLeadListFilters, leadListFiltersToQuery, hasActiveLeadFilters,
  planSourceFilter, escapeLike, KANBAN_COLUMNS,
  type LeadListFilters,
} from '@/lib/leads/list-filters'
import { STAGES, STAGE_CONFIG } from '@/lib/scoring/priority'

const DEFAULTS: LeadListFilters = {
  q: '', agentId: 'all', stage: 'all', source: 'all', channelId: 'all',
  language: 'all', quality: 'all', sort: 'recientes', view: 'table', page: 1,
}

describe('parseLeadListFilters', () => {
  it('sin parámetros → todos los filtros en su valor por defecto', () => {
    expect(parseLeadListFilters({})).toEqual(DEFAULTS)
  })

  it('lee cada filtro de la URL', () => {
    expect(parseLeadListFilters({
      q: '  juan ', agent: 'agent-dylan', stage: 'nutricion', source: 'lead_magnet',
      channelId: 'ch-1', lang: 'es', sort: 'atencion', view: 'kanban', page: '3',
    })).toEqual({
      q: 'juan', agentId: 'agent-dylan', stage: 'nutricion', source: 'lead_magnet',
      channelId: 'ch-1', language: 'es', quality: 'all', sort: 'atencion', view: 'kanban', page: 3,
    })
  })

  it('valores basura en sort/view/page caen al defecto (nunca rompen la query)', () => {
    const f = parseLeadListFilters({ sort: 'random', view: 'grid', page: 'abc' })
    expect(f.sort).toBe('recientes')
    expect(f.view).toBe('table')
    expect(f.page).toBe(1)
  })

  it('page negativa o cero → 1', () => {
    expect(parseLeadListFilters({ page: '0' }).page).toBe(1)
    expect(parseLeadListFilters({ page: '-4' }).page).toBe(1)
  })

  it('toma el primer valor cuando el parámetro llega repetido', () => {
    expect(parseLeadListFilters({ stage: ['cerrado', 'perdido'] }).stage).toBe('cerrado')
  })
})

describe('leadListFiltersToQuery', () => {
  it('los valores por defecto no ensucian la URL', () => {
    expect(leadListFiltersToQuery(DEFAULTS)).toBe('')
  })

  it('parse ∘ toQuery es ida y vuelta', () => {
    const filters: LeadListFilters = {
      q: 'ana', agentId: 'agent-adriana', stage: 'nutricion', source: 'event',
      channelId: 'ch-9', language: 'pt', quality: 'all', sort: 'atencion', view: 'kanban', page: 5,
    }
    const params = Object.fromEntries(new URLSearchParams(leadListFiltersToQuery(filters)))
    expect(parseLeadListFilters(params)).toEqual(filters)
  })
})

describe('hasActiveLeadFilters', () => {
  it('el orden y la vista no cuentan como filtro activo', () => {
    expect(hasActiveLeadFilters({ ...DEFAULTS, sort: 'atencion', view: 'kanban', page: 4 })).toBe(false)
  })

  it('cualquier filtro real cuenta', () => {
    expect(hasActiveLeadFilters({ ...DEFAULTS, q: 'x' })).toBe(true)
    expect(hasActiveLeadFilters({ ...DEFAULTS, stage: 'cerrado' })).toBe(true)
    expect(hasActiveLeadFilters({ ...DEFAULTS, channelId: 'ch-1' })).toBe(true)
  })
})

describe('planSourceFilter — el filtro compuesto se resuelve a columnas', () => {
  const CHANNELS = [
    { id: 'ch-lm-1', channelType: 'lead_magnet' },
    { id: 'ch-lm-2', channelType: 'lead_magnet' },
    { id: 'ch-ev-1', channelType: 'event' },
    { id: 'ch-cf-1', channelType: 'contact_form' },
    { id: 'ch-mc-1', channelType: 'manychat_flow' },
  ]

  it('kind respaldado por canales → sus ids, sin traffic_source', () => {
    const plan = planSourceFilter('lead_magnet', CHANNELS)
    expect(plan.channelIds).toEqual(['ch-lm-1', 'ch-lm-2'])
    expect(plan.trafficSources).toEqual([])
    expect(plan.impossible).toBe(false)
  })

  it('kind de entrada directa → traffic_source, sin canales', () => {
    const plan = planSourceFilter('instagram', CHANNELS)
    expect(plan.channelIds).toEqual([])
    expect(plan.trafficSources).toEqual(['instagram'])
    expect(plan.impossible).toBe(false)
  })

  it('"manual" es mixto: canales de tipo manual Y traffic_source direct', () => {
    const plan = planSourceFilter('manual', [...CHANNELS, { id: 'ch-man', channelType: 'manual' }])
    expect(plan.channelIds).toEqual(['ch-man'])
    expect(plan.trafficSources).toEqual(['direct'])
  })

  it('manychat_flow se mapea al kind "manychat"', () => {
    expect(planSourceFilter('manychat', CHANNELS).channelIds).toEqual(['ch-mc-1'])
  })

  it('kind sin canales ni traffic_source posibles → impossible (no se consulta la BD)', () => {
    expect(planSourceFilter('event', []).impossible).toBe(true)
    expect(planSourceFilter('kind-inventado', CHANNELS).impossible).toBe(true)
  })
})

describe('escapeLike', () => {
  it('neutraliza los comodines de LIKE', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('back\\slash')).toBe('back\\\\slash')
  })

  it('deja intacto un término normal', () => {
    expect(escapeLike('juan perez')).toBe('juan perez')
  })
})

describe('KANBAN_COLUMNS', () => {
  it('hay exactamente una columna por etapa, sin repetir', () => {
    expect([...KANBAN_COLUMNS].sort()).toEqual([...STAGES].sort())
    expect(new Set(KANBAN_COLUMNS).size).toBe(KANBAN_COLUMNS.length)
  })

  it('cada columna tiene etiqueta', () => {
    for (const s of KANBAN_COLUMNS) expect(STAGE_CONFIG[s].label).toBeTruthy()
  })
})

describe('Compatibilidad con enlaces viejos', () => {
  it('?status= sigue abriendo la lista filtrada por etapa', () => {
    // Los enlaces guardados de antes de la 082 llevaban ?status=. Caer en un
    // filtro vacio seria peor que traducir mal: aqui se acepta el alias tal cual.
    expect(parseLeadListFilters({ status: 'cerrado' }).stage).toBe('cerrado')
  })

  it('?stage= gana sobre ?status= si vienen los dos', () => {
    expect(parseLeadListFilters({ stage: 'nuevo', status: 'cerrado' }).stage).toBe('nuevo')
  })
})
