import { describe, expect, it } from 'vitest'
import { formatConversion } from '@/lib/sources/conversion'

describe('formatConversion', () => {
  it('sin vistas no hay cifra: muestra una raya, no "null%" ni "0%"', () => {
    expect(formatConversion(null)).toBe('—')
  })

  it('con vistas muestra el porcentaje, también cuando es 0', () => {
    expect(formatConversion(0)).toBe('0%')
    expect(formatConversion(12.5)).toBe('12.5%')
  })
})
