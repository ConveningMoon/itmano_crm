import { describe, expect, it } from 'vitest'
import {
  buildAllTagSequencesPrompt,
  parseAllTagSequenceImport,
  parseEmailImport,
} from '@/lib/email-sequence-import'

describe('parseEmailImport', () => {
  it('ordena por hora acumulada y conserva el contenido', () => {
    const result = parseEmailImport(JSON.stringify({
      emails: [
        { send_at_hours: 48, subject: 'Tercero', body: 'Tres' },
        { send_at_hours: 0, subject: 'Primero', body: 'Uno' },
        { send_at_hours: 24, subject: 'Segundo', body: 'Dos' },
      ],
    }))

    expect(result).toMatchObject({
      ok: true,
      emails: [
        { send_at_hours: 0, subject: 'Primero' },
        { send_at_hours: 24, subject: 'Segundo' },
        { send_at_hours: 48, subject: 'Tercero' },
      ],
      skipped: [],
    })
  })

  it('omite horas duplicadas del archivo después de ordenar', () => {
    const result = parseEmailImport(JSON.stringify({
      emails: [
        { send_at_hours: 6, subject: 'Se conserva', body: 'Uno' },
        { send_at_hours: 6, subject: 'Se omite', body: 'Dos' },
      ],
    }))

    expect(result).toMatchObject({
      ok: true,
      emails: [{ send_at_hours: 6, subject: 'Se conserva' }],
      skipped: [{ sendAtHours: 6, subject: 'Se omite' }],
    })
  })

  it.each([
    ['JSON roto', '{'],
    ['hora decimal', JSON.stringify({ emails: [{ send_at_hours: 1.5, subject: 'A', body: 'B' }] })],
    ['hora negativa', JSON.stringify({ emails: [{ send_at_hours: -1, subject: 'A', body: 'B' }] })],
    ['campo desconocido', JSON.stringify({ emails: [{ send_at_hours: 0, subject: 'A', body: 'B', html: '<b>B</b>' }] })],
    ['asunto vacío', JSON.stringify({ emails: [{ send_at_hours: 0, subject: ' ', body: 'B' }] })],
    ['lista vacía', JSON.stringify({ emails: [] })],
  ])('rechaza %s sin hacer una importación parcial', (_case, raw) => {
    expect(parseEmailImport(raw).ok).toBe(false)
  })

  it('devuelve errores de estructura en español y señala la fila', () => {
    expect(parseEmailImport(JSON.stringify({
      emails: [{ send_at_hours: 2.5, subject: 'A', body: 'B' }],
    }))).toEqual({
      ok: false,
      error: 'Email 1, send_at_hours: debe ser un entero entre 0 y 8760.',
    })
  })
})

describe('parseAllTagSequenceImport', () => {
  it('ordena y deduplica horas por etiqueta e idioma, no globalmente', () => {
    const result = parseAllTagSequenceImport(JSON.stringify({ sequences: [
      { tag_slug: 'fuera-de-zona', language: 'es', emails: [
        { send_at_hours: 24, subject: 'Después', body: 'B' },
        { send_at_hours: 0, subject: 'Ahora', body: 'A' },
        { send_at_hours: 0, subject: 'Duplicado', body: 'C' },
      ] },
      { tag_slug: 'nurture-largo-plazo', language: 'es', emails: [
        { send_at_hours: 0, subject: 'También ahora', body: 'D' },
      ] },
    ] }))

    expect(result).toMatchObject({
      ok: true,
      sequences: [
        { tag_slug: 'fuera-de-zona', emails: [{ send_at_hours: 0 }, { send_at_hours: 24 }] },
        { tag_slug: 'nurture-largo-plazo', emails: [{ send_at_hours: 0 }] },
      ],
      skipped: [{ tagSlug: 'fuera-de-zona', language: 'es', sendAtHours: 0 }],
    })
  })

  it('rechaza una combinación etiqueta + idioma repetida', () => {
    const block = { tag_slug: 'fuera-de-zona', language: 'es', emails: [{ send_at_hours: 0, subject: 'A', body: 'B' }] }
    expect(parseAllTagSequenceImport(JSON.stringify({ sequences: [block, block] }))).toEqual({
      ok: false,
      error: 'La combinación fuera-de-zona + es está repetida.',
    })
  })
})

describe('buildAllTagSequencesPrompt', () => {
  it('explica el contrato que valida el importador', () => {
    const prompt = buildAllTagSequencesPrompt({ tags: [{
      slug: 'nurture-largo-plazo', name: 'Nurture largo plazo',
      description: 'Seguimiento', languages: ['es', 'en'],
    }] })

    expect(prompt).toContain('"tag_slug"')
    expect(prompt).toContain('"send_at_hours": 0')
    expect(prompt).toContain('Distintas etiquetas sí pueden usar la misma hora')
    expect(prompt).toContain('{{customer_name}}')
    expect(prompt).toContain('sin markdown')
    expect(prompt).toContain('nurture-largo-plazo: Nurture largo plazo')
  })
})
