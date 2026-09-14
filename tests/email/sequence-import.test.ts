import { describe, expect, it } from 'vitest'
import {
  buildExternalEmailPrompt,
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

describe('buildExternalEmailPrompt', () => {
  it('explica el contrato que valida el importador', () => {
    const prompt = buildExternalEmailPrompt({ sequenceName: 'Nurture largo plazo', language: 'es' })

    expect(prompt).toContain('"send_at_hours": 0')
    expect(prompt).toContain('No repitas horas')
    expect(prompt).toContain('{{customer_name}}')
    expect(prompt).toContain('sin markdown')
    expect(prompt).toContain('Nurture largo plazo')
  })
})
