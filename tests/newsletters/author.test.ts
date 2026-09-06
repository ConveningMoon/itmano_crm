import { describe, it, expect } from 'vitest'
import { resolveEditionAuthor } from '@/lib/newsletters/author'

// Desde la migración 113 la firma tiene DOS ejes independientes: la persona y
// la agencia. Lo que estos tests fijan es justamente que sean independientes —
// la version anterior caia a la agencia cuando no habia agente, y eso es lo
// que hacia imposible publicar firmando a las dos, o a ninguna.

const TENANT = 'A&J Real Estate Group'

describe('resolveEditionAuthor', () => {
  it('firma la persona y la agencia a la vez', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: 'Maria Gonzalez', coverPhotoUrl: 'https://cdn/foto.webp' },
      tenantName: TENANT,
      signWithOrg: true,
    })).toEqual({
      agentId: 'agent-1',
      name: 'Maria Gonzalez',
      avatarUrl: 'https://cdn/foto.webp',
      orgName: TENANT,
    })
  })

  it('sin agencia deja sola a la persona', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: 'Maria Gonzalez' },
      tenantName: TENANT,
      signWithOrg: false,
    })).toEqual({ agentId: 'agent-1', name: 'Maria Gonzalez', avatarUrl: null, orgName: null })
  })

  it('sin agente firma solo la agencia, sin inventar un vinculo', () => {
    expect(resolveEditionAuthor({ agent: null, tenantName: TENANT, signWithOrg: true }))
      .toEqual({ agentId: null, name: null, avatarUrl: null, orgName: TENANT })
  })

  // El caso que la version anterior no podia representar: publicar sin firma.
  it('sin agente y sin agencia se queda sin ninguna firma', () => {
    expect(resolveEditionAuthor({ agent: null, tenantName: TENANT, signWithOrg: false }))
      .toEqual({ agentId: null, name: null, avatarUrl: null, orgName: null })
  })

  it('un agente con nombre en blanco cuenta como sin agente', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'agent-1', name: '   ', coverPhotoUrl: 'https://cdn/foto.webp' },
      tenantName: TENANT,
      signWithOrg: true,
    })).toEqual({ agentId: null, name: null, avatarUrl: null, orgName: TENANT })
  })

  it('recorta los espacios del nombre', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'a1', name: '  Maria  ' }, tenantName: 'T', signWithOrg: false,
    })).toEqual({ agentId: 'a1', name: 'Maria', avatarUrl: null, orgName: null })
  })

  // La foto acompaña a una persona. Sin firma personal no hay cara que poner
  // junto al nombre de una marca.
  it('no arrastra la foto cuando no firma una persona', () => {
    const result = resolveEditionAuthor({ agent: null, tenantName: 'T', signWithOrg: true })
    expect(result.avatarUrl).toBeNull()
  })

  it('una foto en blanco es lo mismo que no tener foto', () => {
    expect(resolveEditionAuthor({
      agent: { id: 'a1', name: 'Maria', coverPhotoUrl: '   ' }, tenantName: 'T', signWithOrg: false,
    }).avatarUrl).toBeNull()
  })

  it('una agencia sin nombre no puede firmar aunque se pida', () => {
    expect(resolveEditionAuthor({ agent: null, tenantName: '  ', signWithOrg: true }))
      .toEqual({ agentId: null, name: null, avatarUrl: null, orgName: null })
  })

  // agents.specialty es un codigo de segmento de audiencia (hispanic |
  // military | first_buyer | brazilian), no un cargo: el resultado nunca lo
  // lleva, ni siquiera si alguien lo cuela en el objeto de entrada.
  it('no lleva especialidad aunque el llamador la incluya en el agente', () => {
    const agent = { id: 'a1', name: 'Maria', specialty: 'hispanic' } as { id: string; name: string }
    const result = resolveEditionAuthor({ agent, tenantName: 'T', signWithOrg: false })
    expect(result).toEqual({ agentId: 'a1', name: 'Maria', avatarUrl: null, orgName: null })
    expect(result).not.toHaveProperty('title')
  })
})
