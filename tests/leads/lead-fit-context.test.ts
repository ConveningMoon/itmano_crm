import { describe, it, expect } from 'vitest'
import {
  formatTagLines, formatOpenHouseLines, formatReplyLines, formatPurchaseLines, formatSequenceLines,
} from '@/lib/services/lead-fit-context'

// Lo que se prueba es QUÉ ve la IA del análisis de fit. Etiquetas y asistencia a
// open houses no escriben (o no del todo) lead_events, así que si estas líneas
// no salen, el briefing se arma sin esos hechos.

const NOW = new Date('2026-09-25T12:00:00Z')

describe('formatTagLines', () => {
  it('incluye nombre, descripción y fecha de cada etiqueta', () => {
    expect(formatTagLines([
      { created_at: '2026-09-20T10:00:00Z', lead_tags: { name: 'Contactado sin respuesta', description: 'Se llamó dos veces' } },
      { created_at: '2026-09-21T10:00:00Z', lead_tags: [{ name: 'Pre-aprobado', description: null }] },
    ])).toEqual([
      '- Contactado sin respuesta — Se llamó dos veces (desde 2026-09-20)',
      '- Pre-aprobado (desde 2026-09-21)',
    ])
  })

  it('descarta asignaciones sin etiqueta resuelta', () => {
    expect(formatTagLines([{ created_at: '2026-09-20T10:00:00Z', lead_tags: null }])).toEqual([])
  })
})

describe('formatOpenHouseLines', () => {
  const oh = (starts_at: string, status = 'scheduled') => ({
    starts_at, status, properties: { name: 'Casa Olivo', address: '123 Main St', city: 'Miami' },
  })

  it('distingue asistió, no se presentó, sin marcar y próximo', () => {
    const lines = formatOpenHouseLines([
      { response: 'yes', guests: 2, attended: true,  updated_at: '', open_houses: oh('2026-09-10T15:00:00Z') },
      { response: 'yes', guests: 0, attended: false, updated_at: '', open_houses: oh('2026-09-11T15:00:00Z') },
      { response: 'yes', guests: 1, attended: null,  updated_at: '', open_houses: oh('2026-09-12T15:00:00Z') },
      { response: 'yes', guests: 0, attended: null,  updated_at: '', open_houses: oh('2026-10-01T15:00:00Z') },
      { response: 'no',  guests: 0, attended: null,  updated_at: '', open_houses: oh('2026-09-13T15:00:00Z') },
    ], NOW)
    expect(lines[0]).toBe('- 2026-09-10 Open house en Casa Olivo, Miami: confirmó que iría con 2 acompañantes; ASISTIÓ en persona.')
    expect(lines[1]).toContain('no se presentó')
    expect(lines[2]).toContain('con 1 acompañante; asistencia sin marcar')
    expect(lines[3]).toContain('todavía no ocurre')
    expect(lines[4]).toBe('- 2026-09-13 Open house en Casa Olivo, Miami: respondió que NO iría.')
  })

  it('marca los open houses cancelados', () => {
    const [line] = formatOpenHouseLines([
      { response: 'yes', guests: 0, attended: null, updated_at: '', open_houses: [oh('2026-09-10T15:00:00Z', 'cancelled')] },
    ], NOW)
    expect(line).toContain('el open house se canceló')
  })
})

describe('otras secciones', () => {
  it('recorta el cuerpo de los correos del lead', () => {
    const [line] = formatReplyLines([{ subject: 'Re: visita', body_text: 'a'.repeat(900), received_at: '2026-09-24T10:00:00Z' }])
    expect(line.startsWith('- 2026-09-24 «Re: visita»: ')).toBe(true)
    expect(line.length).toBeLessThan(560)
  })

  it('describe el proceso de compra en curso', () => {
    expect(formatPurchaseLines([{ address: '1 Ocean Dr', loan_type: 'FHA', closing_date: '2026-10-30', notes: null, completed_at: null }]))
      .toEqual(['- Proceso de compra: propiedad 1 Ocean Dr; préstamo FHA; cierre 2026-10-30; en curso.'])
  })

  it('nombra las secuencias activas', () => {
    expect(formatSequenceLines([{ status: 'active', started_at: '2026-09-01T00:00:00Z', email_sequences: { name: 'Nutrición compradores' } }]))
      .toEqual(['- Nutrición compradores (active, desde 2026-09-01)'])
  })
})
