import { describe, expect, it } from 'vitest'
import { cellState, countMissingClosing, isPlaceholder } from '@/lib/emails/purchase-state'

const row = (language: string, resend_template_id: string) => ({
  language, resend_template_id, subject: null, body_json: null,
})

describe('estado de los correos de cierre', () => {
  it('un id vacío o REPLACE_ME es un placeholder', () => {
    expect(isPlaceholder('')).toBe(true)
    expect(isPlaceholder('REPLACE_ME_start')).toBe(true)
    expect(isPlaceholder('tpl_123')).toBe(false)
  })

  it('sin contenido ni template real está sin configurar', () => {
    expect(cellState(row('es', 'REPLACE_ME'))).toBe('empty')
    expect(cellState(row('es', 'tpl_123'))).toBe('template')
  })

  it('sólo cuenta los idiomas que atiende el agente', () => {
    const templates = [row('es', 'REPLACE_ME'), row('en', 'REPLACE_ME'), row('pt', 'tpl_1')]
    expect(countMissingClosing({ languages: ['es'], templates })).toBe(1)
    expect(countMissingClosing({ languages: ['es', 'en', 'pt'], templates })).toBe(2)
    expect(countMissingClosing({ languages: [], templates })).toBe(0)
  })
})
