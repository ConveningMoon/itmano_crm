import { describe, it, expect } from 'vitest'
import {
  parseStudioForm, requireTemplate, validateTemplateChoice, referenceCount, usesAi,
  MAX_REFERENCES, BADGE_MAX, STAT_LABEL_MAX,
} from '@/lib/studio/recipes'
import { STYLE_KEYS, styleDirection } from '@/lib/studio/styles'
import { DEFAULT_PALETTE, paletteRow } from '@/lib/studio/palettes'
import { ASPECTS } from '@/lib/studio/types'
import type { TemplateMeta } from '@/lib/studio/templates/meta'

const base = { style: 'editorial', aspect: '4:5', palette: { brand: '#1B2A41', surface: '#FBF6EE', ink: '#1B2A41' } }

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

  it('vendida solo necesita la dirección: ni cifra ni nota', () => {
    // La cifra y la nota se retiraron del formulario. Sus campos siguen en el
    // esquema para que las piezas guardadas se recompongan, pero nada los exige.
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent' }).ok).toBe(true)
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', show_price: true }).ok).toBe(true)
  })

  it('la cifra de un evento es opcional', () => {
    // Se retiró el interruptor "Entrada libre": era un control para decidir si
    // un campo que ya es opcional se rellenaba.
    const ev = { ...base, recipe: 'event', title: 'Seminario', date: '2026-09-01', time_start: '18:00', venue: 'Centro' }
    expect(parseStudioForm(ev).ok).toBe(true)
    expect(parseStudioForm({ ...ev, price: 25 }).ok).toBe(true)
  })

  it('el encabezado se puede escribir y tiene tope', () => {
    const ok = parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', badge: 'RECIÉN VENDIDA' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data.badge).toBe('RECIÉN VENDIDA')
    expect(parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', badge: 'X'.repeat(BADGE_MAX + 1) }).ok).toBe(false)
  })

  it('las etiquetas de las características son de una sola palabra', () => {
    const listing = { ...base, recipe: 'new_listing', address: '9 Bay St', price: 450000 }
    expect(parseStudioForm({ ...listing, bedrooms_label: 'dorm' }).ok).toBe(true)
    // Van una detrás de otra en la misma fila: dos palabras rompen la fila.
    expect(parseStudioForm({ ...listing, bedrooms_label: 'dos palabras' }).ok).toBe(false)
    expect(parseStudioForm({ ...listing, sqft_label: 'X'.repeat(STAT_LABEL_MAX + 1) }).ok).toBe(false)
  })

  it('usesAi: con propiedad no hay IA; sin propiedad, solo si se describió la escena', () => {
    const parse = (over: Record<string, unknown>) => {
      const r = parseStudioForm({ ...base, recipe: 'sold', address: 'Ghent', ...over })
      if (!r.ok) throw new Error(r.error)
      return r.data
    }
    const conPropiedad = parse({ property_id: '3f0d3a4e-1f2b-4c1d-9a1e-8d7c6b5a4321', source_mode: 'photo', scene_notes: 'da igual' })
    expect(usesAi(conPropiedad)).toBe(false)
    expect(usesAi(parse({}))).toBe(false)
    expect(usesAi(parse({ scene_notes: 'colonial de ladrillo con porche' }))).toBe(true)
  })

  it('el prompt abierto solo necesita el prompt', () => {
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'una llave dorada sobre mármol' }).ok).toBe(true)
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: '' }).ok).toBe(false)
  })

  it('una referencia ya no necesita rol declarado', () => {
    // El rol se preguntaba cuando la referencia vivía en la pestaña de recetas.
    // Ahora vive en "Mi Imagen", donde el prompt dice qué hacer con ella.
    const r = parseStudioForm({
      ...base, recipe: 'open_prompt', prompt: 'la casa de la foto al atardecer', reference_count: 1,
    })
    expect(r.ok).toBe(true)
  })

  it('cuenta las referencias en los dos formatos', () => {
    const legacy = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'una llave dorada', has_reference: true })
    expect(legacy.ok).toBe(true)
    // Las piezas viejas declaran un booleano; sin esto, su variante saldría sin
    // las reglas de referencia en el prompt.
    if (legacy.ok) expect(referenceCount(legacy.data)).toBe(1)

    const fresh = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'una llave dorada', reference_count: 3 })
    expect(fresh.ok).toBe(true)
    if (fresh.ok) expect(referenceCount(fresh.data)).toBe(3)
  })

  it('no acepta más referencias de las que caben', () => {
    const r = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'una llave dorada', reference_count: MAX_REFERENCES + 1 })
    expect(r.ok).toBe(false)
  })

  it('el estilo tiene default: dejó de pedirse en el formulario', () => {
    const r = parseStudioForm({ aspect: '4:5', recipe: 'open_prompt', prompt: 'una llave dorada sobre mármol' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(STYLE_KEYS).toContain(r.data.style)
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
    expect(parseStudioForm({ ...base, palette: { brand: 'azul', surface: '#FFFFFF', ink: '#000000' }, recipe: 'open_prompt', prompt: 'x y z' }).ok).toBe(false)
  })

  it('acepta la paleta vieja (array de hex) y la traduce a roles', () => {
    // Las piezas guardadas antes de los roles tienen `palette: ['#hex']` en su
    // form_json: sin esto, recomponerlas fallaría.
    const r = parseStudioForm({
      style: 'editorial', aspect: '4:5', palette: ['#8C4A32'],
      recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.palette.brand).toBe('#8C4A32')
      expect(r.data.palette.surface).toBe(DEFAULT_PALETTE.surface)
      expect(r.data.palette.logo).toBe('#8C4A32')
    }
  })

  it('una paleta sin color de logo lo hereda del primario', () => {
    // `logo` es un rol posterior al resto: las piezas guardadas antes de que
    // existiera traen solo tres colores y tienen que recomponerse igual que se
    // veían — entonces el logo se teñía con el primario.
    const r = parseStudioForm({
      style: 'editorial', aspect: '4:5',
      palette: { brand: '#8C4A32', surface: '#FAF1E8', ink: '#4A2318' },
      recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.palette.logo).toBe('#8C4A32')
  })

  it('conserva el color de logo cuando viene declarado', () => {
    const r = parseStudioForm({
      ...base,
      palette: { brand: '#1B2A41', surface: '#FBF6EE', ink: '#1B2A41', logo: '#C9A227' },
      recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.palette.logo).toBe('#C9A227')
  })

  it('una paleta vacía cae a los valores por defecto', () => {
    const r = parseStudioForm({
      style: 'editorial', aspect: '4:5', palette: [],
      recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.palette).toEqual(DEFAULT_PALETTE)
  })

  it('la paleta que va a la columna es una lista plana, no el objeto de roles', () => {
    // `studio_images.palette` es text[]. Insertar ahí el objeto de roles hacía
    // fallar TODO guardado con "expected JSON array", y no se veía porque
    // previsualizar no escribe en la base.
    const row = paletteRow(DEFAULT_PALETTE)
    expect(Array.isArray(row)).toBe(true)
    expect(row).toHaveLength(4)
    row.forEach(hex => expect(hex).toMatch(/^#[0-9A-F]{6}$/i))
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
      expect(r.data.palette).toEqual(DEFAULT_PALETTE)
      expect(r.data.has_reference).toBe(false)
    }
  })
})

describe('aspecto — el schema deriva de ASPECTS, no de literales repetidos', () => {
  // Si algún día alguien vuelve a escribir el enum a mano en recipes.ts, este
  // test es el que se rompe: comprueba que el esquema real (el que valida el
  // formulario de cualquier receta) acepta EXACTAMENTE lo que declara ASPECTS,
  // ni más ni menos.
  it('acepta todos los valores de ASPECTS', () => {
    for (const aspect of ASPECTS) {
      const r = parseStudioForm({ ...base, aspect, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' })
      expect(r.ok).toBe(true)
    }
  })

  it('rechaza un aspecto que no está en ASPECTS', () => {
    const r = parseStudioForm({ ...base, aspect: '21:9', recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' })
    expect(r.ok).toBe(false)
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

  // Catálogo mínimo para probar validateTemplateChoice/requireTemplate sin BD:
  // ambas funciones son puras y reciben el catálogo ya cargado.
  const metas: TemplateMeta[] = [
    {
      key: 'mosaico-listing', label: 'Mosaico', hint: '',
      recipes: ['new_listing'], aspects: ['4:5'],
      slots: { required: [], optional: [] }, idealPhotos: 0, thumbUrl: null,
    },
    {
      key: 'mosaico-open-house', label: 'Mosaico casa abierta', hint: '',
      recipes: ['open_house'], aspects: ['4:5'],
      slots: { required: [], optional: [] }, idealPhotos: 0, thumbUrl: null,
    },
  ]

  it('el esquema acepta una receta de casa sin diseño: las piezas viejas se recomponen', () => {
    // Exigir el template en el esquema dejaría sin recomponer las piezas hechas
    // antes de los templates, que tienen template nulo en form_json.
    expect(parseStudioForm(listing).ok).toBe(true)
  })

  it('crear una pieza nueva de casa SÍ exige diseño', () => {
    const r = parseStudioForm(listing)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const denied = requireTemplate(r.data, metas)
      expect(denied).not.toBeNull()
      expect(denied!.error).toContain('diseño')
    }
  })

  it('event y open_prompt nunca exigen diseño', () => {
    const r = parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(requireTemplate(r.data, metas)).toBeNull()
  })

  it('rechaza una clave de diseño inventada', () => {
    const r = parseStudioForm(listing)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const denied = validateTemplateChoice({ ...r.data, template: 'no-existe' }, [])
      expect(denied).not.toBeNull()
      expect(denied!.error).toContain('diseño')
    }
  })

  it('event y open_prompt no piden diseño', () => {
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' }).ok).toBe(true)
  })

  it('acepta un diseño que declara esa receta y rechaza uno que no', () => {
    const r = parseStudioForm(listing)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(validateTemplateChoice({ ...r.data, template: 'mosaico-listing' }, metas)).toBeNull()
      expect(validateTemplateChoice({ ...r.data, template: 'mosaico-open-house' }, metas)).not.toBeNull()
    }
  })

  it('headline es opcional y se limita a 60 caracteres', () => {
    const ok = parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'Casa elegante y familiar en venta' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data.headline).toBe('Casa elegante y familiar en venta')
    expect(parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'x'.repeat(61) }).ok).toBe(false)
  })
})
