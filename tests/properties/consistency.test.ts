import { describe, it, expect } from 'vitest'
import { checkPropertyConsistency } from '@/lib/properties/consistency'

// Caso real de la auditoría (Tenant Test): la ficha decía una cosa y el texto
// generado por IA otra, y la página pública publicó ambas.

const facts = { year_built: 1754, sqft: 1488, bedrooms: 4, bathrooms_full: 2, garage_spaces: 0 }
const texts = [
  'Set on a welcoming street, this home offers 4 bedrooms and 2.5 baths across approximately 1,488 square feet.',
  '4 bedrooms, 2 full and 1 half bathrooms\nApproximately 2,126 square feet\nBuilt in 1913, Colonial/Traditional style\nDetached 2-car garage plus driveway parking',
  'Construida en 1913, estilo Colonial\nGaraje independiente para 2 autos',
]

describe('checkPropertyConsistency', () => {
  it('detecta año, superficie y garaje contradictorios', () => {
    const w = checkPropertyConsistency(facts, texts)
    const byField = Object.fromEntries(w.map(x => [x.field, x]))
    expect(byField.year_built).toMatchObject({ value: 1754, inText: 1913 })
    expect(byField.sqft).toMatchObject({ value: 1488, inText: 2126 })
    expect(byField.garage_spaces).toMatchObject({ value: 0, inText: 2 })
    expect(byField.bedrooms).toBeUndefined()
  })

  it('sin contradicciones no avisa', () => {
    const ok = { year_built: 1913, sqft: 1488, bedrooms: 4, bathrooms_full: 2, garage_spaces: 2 }
    expect(checkPropertyConsistency(ok, ['4 bedrooms, 1,488 sq ft, built in 1913, 2-car garage'])).toEqual([])
  })

  it('un campo vacío no es contradicción', () => {
    const empty = { year_built: null, sqft: null, bedrooms: null, bathrooms_full: null, garage_spaces: null }
    expect(checkPropertyConsistency(empty, ['Built in 1913, 3 bedrooms, 1,200 square feet'])).toEqual([])
  })

  it('sin texto no avisa', () => {
    expect(checkPropertyConsistency(facts, ['', ''])).toEqual([])
  })
})
