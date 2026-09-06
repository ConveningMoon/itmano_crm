import { describe, it, expect } from 'vitest'
import { publishBlockers, PLACEHOLDER_COVER_URL } from '@/lib/newsletters/publishable'
import type { NewsletterContent } from '@/lib/newsletters/content'
import { NEWSLETTER_CONTENT_VERSION } from '@/lib/newsletters/content'

const fuente = {
  id: 's1', url: 'https://nar.realtor/x', title: 'Informe', publisher: 'NAR', accessed_at: '2026-08-24',
}
const contenidoOk: NewsletterContent = {
  v: NEWSLETTER_CONTENT_VERSION,
  blocks: [{ type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] }],
}

const base = {
  title: 'El mercado en agosto',
  coverImageUrl: 'https://x.test/portada.png',
  content: contenidoOk,
  sources: [fuente],
}

describe('publishBlockers', () => {
  it('no bloquea una edicion completa', () => {
    expect(publishBlockers(base)).toEqual([])
  })

  it('bloquea sin portada', () => {
    const codes = publishBlockers({ ...base, coverImageUrl: null }).map(b => b.code)
    expect(codes).toContain('no_cover')
  })

  it('bloquea con la portada marcador, que es el banner de ITMANO', () => {
    // El producto es white-label: publicar asi pone el logo de ITMANO en el
    // escaparate publico del cliente. Toda edicion generada con IA nace asi.
    const blockers = publishBlockers({ ...base, coverImageUrl: PLACEHOLDER_COVER_URL })
    expect(blockers.map(b => b.code)).toContain('portada_placeholder')
    expect(blockers.find(b => b.code === 'portada_placeholder')?.detail).toContain('portada propia')
  })

  it('no confunde el marcador con una portada propia', () => {
    expect(publishBlockers({ ...base, coverImageUrl: '/otra-portada.webp' })).toEqual([])
  })

  it('bloquea sin titulo', () => {
    const codes = publishBlockers({ ...base, title: '   ' }).map(b => b.code)
    expect(codes).toContain('no_title')
  })

  it('bloquea un stat cuya fuente no existe en sources', () => {
    const blockers = publishBlockers({ ...base, sources: [] })
    expect(blockers.map(b => b.code)).toContain('fuente_inexistente')
    expect(blockers[0].detail).toContain('Precio medio')
  })

  it('bloquea con contenido invalido', () => {
    const codes = publishBlockers({ ...base, content: null }).map(b => b.code)
    expect(codes).toContain('contenido_invalido')
  })

  it('acumula varios bloqueos a la vez', () => {
    expect(publishBlockers({ title: '', coverImageUrl: null, content: null, sources: [] }).length)
      .toBeGreaterThanOrEqual(3)
  })

  it('un paragraph con sourceId inexistente tambien bloquea', () => {
    const content: NewsletterContent = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ type: 'paragraph', text: 'Dato suelto', sourceIds: ['fantasma'] }],
    }
    const codes = publishBlockers({ ...base, content }).map(b => b.code)
    expect(codes).toContain('fuente_inexistente')
  })
})
