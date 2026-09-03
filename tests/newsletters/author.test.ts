import { describe, it, expect } from 'vitest'
import { resolveEditionAuthor } from '@/lib/newsletters/author'

describe('resolveEditionAuthor', () => {
  it('firma el agente por su nombre, sin segunda linea', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: 'Maria Gonzalez' },
      tenantName: 'A&J Real Estate Group',
    })).toEqual({ agentId: 'agent-1', name: 'Maria Gonzalez' })
  })

  // Nunca se publica sin firma: sin agente resoluble, firma la agencia.
  it('sin agente firma la agencia y no inventa un vinculo', () => {
    expect(resolveEditionAuthor({ agent: null, tenantName: 'A&J Real Estate Group' }))
      .toEqual({ agentId: null, name: 'A&J Real Estate Group' })
  })

  it('un agente con nombre en blanco cuenta como sin agente', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: '   ' },
      tenantName: 'A&J Real Estate Group',
    })).toEqual({ agentId: null, name: 'A&J Real Estate Group' })
  })

  it('recorta los espacios del nombre', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'a1', name: '  Maria  ' },
      tenantName: 'T',
    })).toEqual({ agentId: 'a1', name: 'Maria' })
  })

  // agents.specialty es un codigo de segmento de audiencia (hispanic |
  // military | first_buyer | brazilian), no un cargo: el resultado nunca lo
  // lleva, ni siquiera si alguien lo cuela en el objeto de entrada.
  it('no lleva especialidad aunque el llamador la incluya en el agente', () => {
    const agent = { id: 'a1', name: 'Maria', specialty: 'hispanic' } as { id: string; name: string }
    const result = resolveEditionAuthor({ agent, tenantName: 'T' })
    expect(result).toEqual({ agentId: 'a1', name: 'Maria' })
    expect(result).not.toHaveProperty('title')
  })

  it('la firma de la agencia tampoco lleva titulo', () => {
    const result = resolveEditionAuthor({ agent: null, tenantName: 'T' })
    expect(result).toEqual({ agentId: null, name: 'T' })
    expect(result).not.toHaveProperty('title')
  })
})
