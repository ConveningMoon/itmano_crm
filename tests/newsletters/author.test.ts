import { describe, it, expect } from 'vitest'
import { resolveEditionAuthor } from '@/lib/newsletters/author'

describe('resolveEditionAuthor', () => {
  it('firma el agente, con su especialidad', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: 'Maria Gonzalez', specialty: 'Compradores primerizos' },
      tenantName: 'A&J Real Estate Group',
    })).toEqual({ agentId: 'agent-1', name: 'Maria Gonzalez', title: 'Compradores primerizos' })
  })

  it('agente sin especialidad: firma igual, sin segunda linea', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: 'Maria Gonzalez', specialty: null },
      tenantName: 'A&J Real Estate Group',
    })).toEqual({ agentId: 'agent-1', name: 'Maria Gonzalez', title: null })
  })

  // Nunca se publica sin firma: sin agente resoluble, firma la agencia.
  it('sin agente firma la agencia y no inventa un vinculo', () => {
    expect(resolveEditionAuthor({ agent: null, tenantName: 'A&J Real Estate Group' }))
      .toEqual({ agentId: null, name: 'A&J Real Estate Group', title: null })
  })

  it('un agente con nombre en blanco cuenta como sin agente', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: '   ', specialty: 'Lujo' },
      tenantName: 'A&J Real Estate Group',
    })).toEqual({ agentId: null, name: 'A&J Real Estate Group', title: null })
  })

  it('recorta los espacios de nombre y especialidad', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'a1', name: '  Maria  ', specialty: '  Lujo  ' },
      tenantName: 'T',
    })).toEqual({ agentId: 'a1', name: 'Maria', title: 'Lujo' })
  })

  it('una especialidad en blanco no produce segunda linea', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'a1', name: 'Maria', specialty: '   ' },
      tenantName: 'T',
    }).title).toBeNull()
  })
})
