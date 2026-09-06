import { describe, it, expect } from 'vitest'
import { inferSlots } from '@/lib/studio/templates/slots'

describe('inferSlots', () => {
  it('una clave suelta es requerida', () => {
    const r = inferSlots('<img src="{{hero}}"><h1>{{headline}}</h1>')
    expect(r.required).toContain('photo.hero')
    expect(r.required).toContain('text.headline')
    expect(r.optional).toEqual([])
  })

  it('una clave envuelta en seccion es opcional', () => {
    const r = inferSlots('{{#price}}<b>{{price}}</b>{{/price}}')
    expect(r.optional).toContain('text.price')
    expect(r.required).not.toContain('text.price')
  })

  it('si aparece suelta Y en seccion, manda requerida', () => {
    const r = inferSlots('<i>{{price}}</i>{{#price}}<b>{{price}}</b>{{/price}}')
    expect(r.required).toContain('text.price')
    expect(r.optional).not.toContain('text.price')
  })

  it('cuenta el hero mas las miniaturas para idealPhotos', () => {
    const r = inferSlots('{{hero}}{{#thumb1}}{{thumb1}}{{/thumb1}}{{#thumb2}}{{thumb2}}{{/thumb2}}')
    expect(r.idealPhotos).toBe(3)
  })

  it('sin hero no pide fotos', () => {
    const r = inferSlots('<h1>{{headline}}</h1>')
    expect(r.idealPhotos).toBe(0)
  })

  it('las miniaturas colapsan en un solo slot', () => {
    const r = inferSlots('{{#thumb1}}{{thumb1}}{{/thumb1}}{{#thumb2}}{{thumb2}}{{/thumb2}}')
    expect(r.optional.filter(s => s === 'photo.thumbs')).toHaveLength(1)
  })

  it('las specs colapsan en el slot stats', () => {
    const r = inferSlots('{{#stat1}}{{stat1}}{{/stat1}}{{#stat3}}{{stat3}}{{/stat3}}')
    expect(r.optional).toContain('stats')
  })

  it('whenDay y whenTime cuentan como el slot when', () => {
    const r = inferSlots('<p>{{whenDay}}</p><p>{{whenTime}}</p>')
    expect(r.required).toContain('text.when')
  })

  it('un fragmento raw cuenta como su slot', () => {
    const r = inferSlots('<h1>{{&headlineRitmo}}</h1>')
    expect(r.required).toContain('text.headline')
  })

  it('ignora las claves que no son slots', () => {
    const r = inferSlots('<p>{{badge}} {{agentName}}</p>')
    expect(r.required).toEqual([])
    expect(r.optional).toEqual([])
  })
})
