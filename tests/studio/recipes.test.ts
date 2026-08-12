import { describe, it, expect } from 'vitest'
import { parseStudioForm, requireTemplate } from '@/lib/studio/recipes'
import { STYLE_KEYS, styleDirection } from '@/lib/studio/styles'

const base = { style: 'editorial', aspect: '4:5', palette: ['#1B2A41'] }

describe('parseStudioForm', () => {
  it('acepta una casa abierta completa', () => {
    const r = parseStudioForm({
      ...base, recipe: 'open_house',
      address: '123 Ocean View, Norfolk, VA',
      date: '2026-08-15', time_start: '11:00', time_end: '14:00',
    })
    expect(r.ok).toBe(true)
  })

  it('rechaza una casa abierta sin horario antes de gastar nada', () => {
    const r = parseStudioForm({
      ...base, recipe: 'open_house', address: '123 Ocean View', date: '2026-08-15',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('hora')
  })

  it('rechaza una nueva disponible sin precio', () => {
    const r = parseStudioForm({ ...base, recipe: 'new_listing', address: '9 Bay St' })
    expect(r.ok).toBe(false)
  })

  it('exige el precio en vendida solo si se pidió mostrarlo', () => {
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', show_price: false }).ok).toBe(true)
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', show_price: true }).ok).toBe(false)
  })

  it('exige la cifra de un evento que no es gratis', () => {
    const paid = { ...base, recipe: 'event', title: 'Seminario', date: '2026-09-01', time_start: '18:00', venue: 'Centro', is_free: false }
    expect(parseStudioForm(paid).ok).toBe(false)
    expect(parseStudioForm({ ...paid, price: 25 }).ok).toBe(true)
  })

  it('el prompt abierto solo necesita el prompt', () => {
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'una llave dorada sobre mármol' }).ok).toBe(true)
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: '' }).ok).toBe(false)
  })

  it('una referencia sin rol declarado no pasa', () => {
    const r = parseStudioForm({
      ...base, recipe: 'new_listing', address: '9 Bay St', price: 450000, has_reference: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('referencia')
  })

  it('el modo foto exige una propiedad y no aplica a evento ni prompt abierto', () => {
    const ok = parseStudioForm({
      ...base, recipe: 'sold', address: 'Ghent', show_price: false,
      source_mode: 'photo', property_id: '3f0d3a4e-1f2b-4c1d-9a1e-8d7c6b5a4321',
    })
    expect(ok.ok).toBe(true)
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', show_price: false, source_mode: 'photo' }).ok).toBe(false)
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle', source_mode: 'photo' }).ok).toBe(false)
  })

  it('rechaza un estilo inexistente y colores que no son hex', () => {
    expect(parseStudioForm({ ...base, style: 'vaporwave', recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' }).ok).toBe(false)
    expect(parseStudioForm({ ...base, palette: ['azul'], recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' }).ok).toBe(false)
  })

  it('scene_notes es opcional y se conserva', () => {
    const r = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle', scene_notes: 'colonial de ladrillo' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.scene_notes).toBe('colonial de ladrillo')
  })

  it('aplica los valores por defecto de los campos comunes', () => {
    const r = parseStudioForm({ style: 'editorial', aspect: '1:1', recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.source_mode).toBe('generate')
      expect(r.data.palette).toEqual([])
      expect(r.data.has_reference).toBe(false)
    }
  })
})

describe('styles', () => {
  it('los seis estilos tienen dirección de arte no vacía', () => {
    expect(STYLE_KEYS).toHaveLength(6)
    for (const k of STYLE_KEYS) expect(styleDirection(k).length).toBeGreaterThan(40)
  })
})

describe('template y headline', () => {
  const listing = { ...base, recipe: 'new_listing', address: '9 Bay St', price: 450000 }

  it('el esquema acepta una receta de casa sin diseño: las piezas viejas se recomponen', () => {
    // Exigir el template en el esquema dejaría sin recomponer las piezas hechas
    // antes de los templates, que tienen template nulo en form_json.
    expect(parseStudioForm(listing).ok).toBe(true)
  })

  it('crear una pieza nueva de casa SÍ exige diseño', () => {
    const r = parseStudioForm(listing)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const denied = requireTemplate(r.data)
      expect(denied).not.toBeNull()
      expect(denied!.error).toContain('diseño')
    }
  })

  it('event y open_prompt nunca exigen diseño', () => {
    const r = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(requireTemplate(r.data)).toBeNull()
  })

  it('rechaza una clave de diseño inventada', () => {
    const r = parseStudioForm({ ...listing, template: 'no-existe' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('diseño')
  })

  it('event y open_prompt no piden diseño', () => {
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' }).ok).toBe(true)
  })

  it('acepta un diseño que declara esa receta y rechaza uno que no', () => {
    expect(parseStudioForm({ ...listing, template: 'mosaico-listing' }).ok).toBe(true)
    expect(parseStudioForm({ ...listing, template: 'mosaico-open-house' }).ok).toBe(false)
  })

  it('headline es opcional y se limita a 60 caracteres', () => {
    const ok = parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'Casa elegante y familiar en venta' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data.headline).toBe('Casa elegante y familiar en venta')
    expect(parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'x'.repeat(61) }).ok).toBe(false)
  })
})
