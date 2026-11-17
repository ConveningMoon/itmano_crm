import { describe, it, expect } from 'vitest'
import { formatPhone, phoneLinks, phoneE164Digits } from '@/lib/leads/phone-display'

describe('phone-display', () => {
  it('formatea números NANP de 10 y 11 dígitos', () => {
    expect(formatPhone('7579814551')).toBe('(757) 981-4551')
    expect(formatPhone('1-757-981-4551')).toBe('(757) 981-4551')
    expect(formatPhone('+1 757 981 4551')).toBe('(757) 981-4551')
  })

  it('respeta los internacionales tal como se escribieron', () => {
    expect(formatPhone('+34 612 345 678')).toBe('+34 612 345 678')
    expect(phoneE164Digits('+34 612 345 678')).toBe('34612345678')
  })

  it('arma tel: y WhatsApp', () => {
    expect(phoneLinks('757-981-4551')).toEqual({ tel: 'tel:+17579814551', whatsapp: 'https://wa.me/17579814551' })
    expect(phoneLinks('+34 612 345 678')).toEqual({ tel: 'tel:+34612345678', whatsapp: 'https://wa.me/34612345678' })
  })

  it('sin país deducible: llama pero no ofrece WhatsApp', () => {
    expect(phoneLinks('612 345 678')).toEqual({ tel: 'tel:612345678', whatsapp: null })
  })

  it('vacío o basura: sin enlaces', () => {
    expect(phoneLinks(null)).toBeNull()
    expect(phoneLinks('abc')).toBeNull()
    expect(formatPhone(null)).toBe('')
  })
})
