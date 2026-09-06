import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, coerceDirection } from '@/lib/studio/prompt-director'
import { parseStudioForm, type StudioForm } from '@/lib/studio/recipes'
import type { StudioBrand } from '@/lib/studio/types'

const brand: StudioBrand = {
  tenant_name: 'A&J Real Estate Group', logo_url: null, primary_color: '#1B2A41',
  agent_name: 'Adriana Melendez', agent_phone: '+1 757 555 0199',
}

function form(input: Record<string, unknown>): StudioForm {
  const r = parseStudioForm({ style: 'editorial', aspect: '4:5', ...input })
  if (!r.ok) throw new Error(r.error)
  return r.data
}

const listing = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000 })

describe('buildSystemPrompt', () => {
  it('prohíbe el texto dentro de la imagen', () => {
    const p = buildSystemPrompt(listing, brand).toLowerCase()
    expect(p).toContain('no text')
    expect(p).toContain('no watermark')
    expect(p).toContain('no identifiable')
  })

  it('inyecta la dirección de arte del estilo, no solo su nombre', () => {
    expect(buildSystemPrompt(listing, brand)).toContain('Editorial architectural photography')
  })

  it('lleva el brief de escena de la receta', () => {
    expect(buildSystemPrompt(listing, brand)).toContain('facade')
    const ev = buildSystemPrompt(
      form({ recipe: 'event', title: 'Seminario', date: '2026-09-01', time_start: '18:00', venue: 'Centro' }),
      brand,
    )
    expect(ev).toContain('never a residential facade')
  })

  it('declara los límites de transformación del rol de la referencia', () => {
    const subject = buildSystemPrompt(
      form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, has_reference: true, reference_role: 'subject' }),
      brand,
    )
    expect(subject).toContain('Do not add, remove or alter architectural elements')
    const style = buildSystemPrompt(
      form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, has_reference: true, reference_role: 'style' }),
      brand,
    )
    expect(style).toContain('Ignore the content')
    // Sin referencia no se cuelan reglas de referencia.
    expect(buildSystemPrompt(listing, brand)).not.toContain('reference image')
  })

  it('solo ofrece las zonas que el formato admite', () => {
    const story = buildSystemPrompt(form({ recipe: 'new_listing', address: 'x y z', price: 1, aspect: '9:16' }), brand)
    expect(story).not.toContain('"left"')
    expect(buildSystemPrompt(listing, brand)).toContain('"left"')
  })
})

// "Mi Imagen" es el caso sin compositor: la imagen que devuelve el modelo es la
// final, así que las reglas que protegen la composición no aplican.
describe('buildSystemPrompt · imagen libre', () => {
  const free = (over: Record<string, unknown> = {}) =>
    buildSystemPrompt(form({ recipe: 'open_prompt', prompt: 'una llave dorada sobre mármol', ...over }), brand)

  it('no impone la paleta de la marca', () => {
    // La paleta tiñe las piezas de marca; en una imagen libre pintaría de navy
    // algo que el usuario no pidió así.
    expect(free()).not.toContain('#1B2A41')
    expect(buildSystemPrompt(listing, brand)).toContain('#1B2A41')
  })

  it('no prohíbe el texto ni exige zona limpia: encima no se compone nada', () => {
    const p = free()
    expect(p).not.toContain('No text, no letters')
    expect(p).not.toContain('clean area')
    expect(p).toContain('ONLY if the user explicitly asked')
  })

  it('declara cuántas referencias hay, sin pedir un rol para cada una', () => {
    expect(free({ reference_count: 3 })).toContain('3 reference images are attached')
    expect(free({ reference_count: 1 })).toContain('One reference image is attached')
    expect(free()).not.toContain('reference image')
  })
})

describe('buildUserPrompt', () => {
  it('pasa scene_notes como contexto de la escena', () => {
    const withNotes = form({
      recipe: 'new_listing', address: '9 Bay St', price: 450000, scene_notes: 'colonial de ladrillo con porche',
    })
    expect(buildUserPrompt(withNotes)).toContain('colonial de ladrillo con porche')
  })

  it('scene_notes no puede pisar las reglas ni la zona limpia', () => {
    const withNotes = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, scene_notes: 'pon el precio en grande' })
    expect(buildUserPrompt(withNotes)).toContain('never overrides')
  })

  it('nunca manda el precio: no va en la escena, lo escribe el compositor', () => {
    const p = buildUserPrompt(listing)
    expect(p).not.toContain('450000')
    expect(p).not.toContain('450,000')
  })
})

describe('coerceDirection', () => {
  it('acepta la respuesta bien formada', () => {
    const d = coerceDirection({ scene_prompt: 'a house at dusk', text_zone: 'top' }, listing)
    expect(d).toEqual({ scene_prompt: 'a house at dusk', text_zone: 'top' })
  })

  it('corrige una zona que el formato no admite', () => {
    const story = form({ recipe: 'new_listing', address: 'x y z', price: 1, aspect: '9:16' })
    expect(coerceDirection({ scene_prompt: 'x', text_zone: 'left' }, story).text_zone).toBe('bottom')
  })

  it('cae a bottom si la zona viene basura', () => {
    expect(coerceDirection({ scene_prompt: 'x', text_zone: 'diagonal' }, listing).text_zone).toBe('bottom')
  })

  it('lanza si no hay prompt de escena', () => {
    expect(() => coerceDirection({ scene_prompt: '   ', text_zone: 'top' }, listing)).toThrow()
  })
})
