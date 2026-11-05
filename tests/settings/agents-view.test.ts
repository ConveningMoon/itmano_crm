import { describe, expect, it } from 'vitest'
import { redactPeerAgents } from '@/lib/settings/agents-view'
import type { Agent } from '@/lib/types'

const agent = (id: string, over: Partial<Agent> = {}): Agent => ({
  id,
  tenantId: 't1',
  name: `Agente ${id}`,
  email: `${id}@example.com`,
  phone: '555-0100',
  language: 'es',
  languages: ['es', 'en'],
  avatarInitials: 'AG',
  accentColor: '#112233',
  active: true,
  emailSignature: 'Firma',
  senderLocalPart: 'local',
  description: 'Descripción privada',
  coverPhotoUrl: 'https://example.com/x.png',
  ...over,
})

const team = [agent('a'), agent('b'), agent('c')]

describe('redactPeerAgents', () => {
  it('con canManage devuelve todo sin cambios', () => {
    expect(redactPeerAgents(team, 'a', true)).toEqual(team)
  })

  it('sin viewer vacía los datos privados de todos', () => {
    const out = redactPeerAgents(team, null, false)
    for (const a of out) {
      expect(a.email).toBe('')
      expect(a.phone).toBeUndefined()
      expect(a.emailSignature).toBeNull()
      expect(a.description).toBeNull()
      expect(a.coverPhotoUrl).toBeNull()
      expect(a.senderLocalPart).toBeNull()
    }
  })

  it('conserva completo al propio agente', () => {
    const out = redactPeerAgents(team, 'b', false)
    expect(out.find(a => a.id === 'b')).toEqual(team[1])
  })

  it('a los compañeros les quita email, teléfono, firma, descripción, portada y parte local', () => {
    const peer = redactPeerAgents(team, 'b', false).find(a => a.id === 'a')!
    expect(peer.email).toBe('')
    expect(peer.phone).toBeUndefined()
    expect(peer.emailSignature).toBeNull()
    expect(peer.description).toBeNull()
    expect(peer.coverPhotoUrl).toBeNull()
    expect(peer.senderLocalPart).toBeNull()
  })

  it('conserva los campos públicos de los compañeros', () => {
    const peer = redactPeerAgents(team, 'b', false).find(a => a.id === 'a')!
    expect(peer).toMatchObject({
      id: 'a', tenantId: 't1', name: 'Agente a', avatarInitials: 'AG',
      accentColor: '#112233', language: 'es', languages: ['es', 'en'], active: true,
    })
  })

  it('no muta la lista original', () => {
    redactPeerAgents(team, 'b', false)
    expect(team[0].email).toBe('a@example.com')
  })
})
