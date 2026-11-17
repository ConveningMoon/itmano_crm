import { describe, it, expect } from 'vitest'
import { normalizePhone, validateManualLead, isSupportedLanguage, normalizeEmail } from '@/lib/leads/manual-input'

// Alta manual de leads: antes un idioma vacío llegaba al INSERT y la pantalla
// mostraba el error crudo de `leads_language_check`, y "abc" se guardaba como
// teléfono. La validación compartida fija los dos casos.

describe('normalizePhone', () => {
  it('acepta vacío como sin teléfono', () => {
    expect(normalizePhone('')).toEqual({ ok: true, value: null })
    expect(normalizePhone(null)).toEqual({ ok: true, value: null })
  })

  it('acepta formatos habituales y colapsa espacios', () => {
    expect(normalizePhone('(757) 582-1104')).toEqual({ ok: true, value: '(757) 582-1104' })
    expect(normalizePhone('+1  757 582 1104 ')).toEqual({ ok: true, value: '+1 757 582 1104' })
    expect(normalizePhone('7579814551')).toEqual({ ok: true, value: '7579814551' })
  })

  it('rechaza letras, un + en medio y longitudes imposibles', () => {
    expect(normalizePhone('abc').ok).toBe(false)
    expect(normalizePhone('757+5821104').ok).toBe(false)
    expect(normalizePhone('12345').ok).toBe(false)
    expect(normalizePhone('1234567890123456').ok).toBe(false)
  })
})

describe('validateManualLead', () => {
  const base = { firstName: 'Ana', email: 'ana@example.com', phone: null, language: 'es' }

  it('sin errores con datos completos', () => {
    expect(validateManualLead(base)).toEqual({})
  })

  it('exige idioma soportado (el CHECK de la base)', () => {
    expect(validateManualLead({ ...base, language: '' }).language).toBeDefined()
    expect(validateManualLead({ ...base, language: 'xx' }).language).toBeDefined()
    expect(isSupportedLanguage('nl')).toBe(true)
  })

  it('marca nombre, email y teléfono inválidos por campo', () => {
    const errs = validateManualLead({ firstName: ' ', email: 'no-es-email', phone: 'abc', language: 'es' })
    expect(Object.keys(errs).sort()).toEqual(['email', 'firstName', 'phone'])
  })

  it('normaliza el email para comparar duplicados', () => {
    expect(normalizeEmail('  Lead013@Example.COM ')).toBe('lead013@example.com')
  })
})
