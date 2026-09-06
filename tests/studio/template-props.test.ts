import { describe, it, expect } from 'vitest'
import { badgeFor, badgeOf, defaultHeadline, statsFor, priceFor, whenFor } from '@/lib/studio/template-props'
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

  it('vendida NUNCA expone la cifra, ni aunque su form_json la traiga', () => {
    // Un cierre publica el hecho, no el número. Las piezas guardadas cuando sí
    // se pedía la cifra siguen recomponiéndose: el dato se ignora, no falla.
    const conCifra = form({ recipe: 'sold', address: 'Ghent', show_price: true, price: 389000 })
    expect(priceFor(conCifra)).toBeNull()
  })

  it('el encabezado escrito gana al de la receta', () => {
    const propio = form({ recipe: 'sold', address: 'Ghent', badge: 'RECIÉN VENDIDA' })
    expect(badgeOf(propio)).toBe('RECIÉN VENDIDA')
    expect(badgeOf(form({ recipe: 'sold', address: 'Ghent' }))).toBe('VENDIDA')
  })

  it('las etiquetas de las specs se pueden reescribir', () => {
    const propias = form({
      recipe: 'new_listing', address: '9 Bay St', price: 450000,
      bedrooms: 3, sqft: 1548, bedrooms_label: 'dorm', sqft_label: 'm2',
    })
    expect(statsFor(propias).map(s => s.value)).toEqual(['1,548 m2', '3 dorm'])
  })

  it('casa abierta y evento tienen fecha; una venta no', () => {
    const abierta = form({ recipe: 'open_house', address: '1 Main St', date: '2026-08-15', time_start: '11:00', time_end: '14:00' })
    expect(whenFor(abierta)).toBe('15 de agosto de 2026 · 11:00–14:00')
    const evento = form({ recipe: 'event', title: 'Seminario', date: '2026-09-01', time_start: '18:00', venue: 'Centro' })
    expect(whenFor(evento)).toBe('1 de septiembre de 2026 · 18:00')
    expect(whenFor(form({ recipe: 'new_listing', address: '9 Bay St', price: 1 }))).toBeNull()
  })

  it('el título de un evento es su titular', () => {
    const evento = form({ recipe: 'event', title: 'Seminario para compradores', date: '2026-09-01', time_start: '18:00', venue: 'Centro' })
    expect(defaultHeadline(evento)).toBe('Seminario para compradores')
  })
})
