import { describe, it, expect } from 'vitest'
import { badgeFor, defaultHeadline, statsFor, priceFor, whenFor } from '@/lib/studio/template-props'
import { formatMoney, formatDate } from '@/lib/studio/format'
import { parseStudioForm, type StudioForm } from '@/lib/studio/recipes'

function form(input: Record<string, unknown>): StudioForm {
  const r = parseStudioForm({ style: 'editorial', aspect: '4:5', ...input })
  if (!r.ok) throw new Error(r.error)
  return r.data
}

describe('props del template', () => {
  it('la etiqueta depende de la receta', () => {
    expect(badgeFor('open_house')).toBe('CASA ABIERTA')
    expect(badgeFor('new_listing')).toBe('NUEVA DISPONIBLE')
    expect(badgeFor('sold')).toBe('VENDIDA')
  })

  it('el titular cae a un default legible si el agente no lo escribe', () => {
    const sinTitular = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000 })
    expect(defaultHeadline(sinTitular).length).toBeGreaterThan(0)
    const conTitular = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, headline: 'Casa junto al agua' })
    expect(defaultHeadline(conTitular)).toBe('Casa junto al agua')
  })

  it('las specs solo incluyen lo que existe', () => {
    const completo = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, bedrooms: 3, bathrooms: 2, sqft: 1548 })
    expect(statsFor(completo)).toHaveLength(3)
    const vacio = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000 })
    expect(statsFor(vacio)).toHaveLength(0)
  })

  it('el dinero se formatea con separadores y sin decimales', () => {
    expect(formatMoney(274400)).toBe('$274,400')
    expect(formatMoney(450000.4)).toBe('$450,000')
  })

  it('la fecha no depende del ICU del runtime', () => {
    expect(formatDate('2026-08-15')).toBe('15 de agosto de 2026')
  })

  it('vendida sin mostrar precio no expone la cifra', () => {
    const oculto = form({ recipe: 'sold', address: 'Ghent', show_price: false, price: 389000 })
    expect(priceFor(oculto)).toBeNull()
    const visible = form({ recipe: 'sold', address: 'Ghent', show_price: true, price: 389000 })
    expect(priceFor(visible)).toBe('$389,000')
  })

  it('solo casa abierta tiene fecha y horario', () => {
    const abierta = form({ recipe: 'open_house', address: '1 Main St', date: '2026-08-15', time_start: '11:00', time_end: '14:00' })
    expect(whenFor(abierta)).toBe('15 de agosto de 2026 · 11:00–14:00')
    expect(whenFor(form({ recipe: 'new_listing', address: '9 Bay St', price: 1 }))).toBeNull()
  })
})
