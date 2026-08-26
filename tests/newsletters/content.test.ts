import { describe, it, expect } from 'vitest'
import {
  NewsletterContentSchema, parseNewsletterContent, parseNewsletterSources,
  NEWSLETTER_CONTENT_VERSION, CONTENT_LIMITS,
} from '@/lib/newsletters/content'

const heading = { type: 'heading', level: 2, text: 'El mercado en agosto' } as const
const stat    = { type: 'stat', label: 'Precio medio', value: '$385.000', sourceIds: ['s1'] } as const

describe('NewsletterContentSchema', () => {
  it('acepta un documento con todos los tipos de bloque', () => {
    const doc = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [
        heading,
        { type: 'paragraph', text: 'Los precios subieron.', sourceIds: ['s1'] },
        { type: 'list', style: 'bullet', items: ['uno', 'dos'] },
        { type: 'image', url: 'https://x.test/a.png', alt: 'Una casa' },
        { type: 'quote', text: 'Citado', attribution: 'NAR' },
        { type: 'callout', tone: 'info', text: 'Ojo con esto' },
        stat,
      ],
    }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(true)
  })

  it('rechaza un stat sin fuentes', () => {
    const doc = { v: NEWSLETTER_CONTENT_VERSION, blocks: [{ ...stat, sourceIds: [] }] }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(false)
  })

  it('rechaza una version desconocida', () => {
    expect(NewsletterContentSchema.safeParse({ v: 99, blocks: [heading] }).success).toBe(false)
  })

  it('rechaza un documento sin bloques', () => {
    expect(NewsletterContentSchema.safeParse({ v: NEWSLETTER_CONTENT_VERSION, blocks: [] }).success).toBe(false)
  })

  it('parseNewsletterContent devuelve null ante basura en vez de lanzar', () => {
    expect(parseNewsletterContent(null)).toBeNull()
    expect(parseNewsletterContent({ v: 1 })).toBeNull()
    expect(parseNewsletterContent('texto suelto')).toBeNull()
  })
})

describe('parseNewsletterSources', () => {
  it('acepta fuentes validas y descarta las rotas', () => {
    const parsed = parseNewsletterSources([
      { id: 's1', url: 'https://nar.realtor/x', title: 'Informe', publisher: 'NAR', accessed_at: '2026-08-24' },
      { id: 's2', url: 'no-es-una-url', title: 'Rota', publisher: 'X', accessed_at: '2026-08-24' },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('s1')
  })

  it('devuelve lista vacia ante basura', () => {
    expect(parseNewsletterSources(null)).toEqual([])
    expect(parseNewsletterSources({ nope: true })).toEqual([])
  })
})

// La IA produce el dato CON su contexto, que es lo que lo hace util. Con el
// tope viejo de 40, "48 dias (frente a 37 el ano anterior)" cabia por los pelos
// y el siguiente tiraba la edicion entera.
describe('el value de un stat admite el dato con su contexto', () => {
  it('acepta un valor con la comparacion incluida', () => {
    const doc = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ ...stat, value: '48 dias en mercado (frente a 37 el ano anterior)' }],
    }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(true)
  })

  it('sigue teniendo tope', () => {
    const doc = {
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: [{ ...stat, value: 'V'.repeat(CONTENT_LIMITS.statValue + 1) }],
    }
    expect(NewsletterContentSchema.safeParse(doc).success).toBe(false)
  })
})
