import { describe, it, expect } from 'vitest'
import { sourcesFromFindings, editionToolSchema } from '@/lib/newsletters/ai/draft'
import { NewsletterSourceSchema } from '@/lib/newsletters/content'

// Forma mínima que nos interesa comprobar de `editionToolSchema()`. No es el
// tipo completo de JSON Schema — sólo lo que el test necesita para navegarlo.
interface BloqueVariante {
  properties: { type: { const: string }; sourceIds?: { minItems?: number } }
  required: string[]
}
interface EditionSchemaShape {
  type: string
  required: string[]
  properties: {
    blocks: {
      type: string
      minItems: number
      maxItems: number
      items: { oneOf: BloqueVariante[] }
    }
  }
}

describe('sourcesFromFindings', () => {
  it('convierte hallazgos en fuentes validas para el esquema', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'El precio medio subio 4%', url: 'https://nar.realtor/a', publisher: 'NAR', published_at: '2026-08-01' },
      { claim: 'El inventario cayo 9%',    url: 'https://redfin.com/b',  publisher: 'Redfin' },
    ])
    expect(fuentes).toHaveLength(2)
    for (const f of fuentes) {
      expect(NewsletterSourceSchema.safeParse(f).success).toBe(true)
    }
  })

  it('da ids estables y distintos, que es lo que los bloques citan', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'a', url: 'https://nar.realtor/a', publisher: 'NAR' },
      { claim: 'b', url: 'https://nar.realtor/b', publisher: 'NAR' },
    ])
    expect(fuentes[0].id).not.toBe(fuentes[1].id)
    expect(new Set(fuentes.map(f => f.id)).size).toBe(2)
  })

  it('descarta el hallazgo sin url en vez de fabricar una', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'sin respaldo', url: '', publisher: 'X' },
      { claim: 'con respaldo', url: 'https://ine.es/x', publisher: 'INE' },
    ])
    expect(fuentes).toHaveLength(1)
    expect(fuentes[0].url).toBe('https://ine.es/x')
  })

  it('rellena accessed_at con la fecha de hoy', () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const [f] = sourcesFromFindings([{ claim: 'a', url: 'https://ine.es/x', publisher: 'INE' }])
    expect(f.accessed_at).toBe(hoy)
  })

  it('devuelve vacio ante una lista vacia', () => {
    expect(sourcesFromFindings([])).toEqual([])
  })

  it('deduplica por url: tres cifras del mismo articulo son UNA fuente', () => {
    // Sin esto la seccion "Fuentes" de la pagina publica lista el mismo enlace
    // tres veces y aparenta mas material del que hay.
    const fuentes = sourcesFromFindings([
      { claim: 'el precio subio 4%',  url: 'https://nar.realtor/informe', publisher: 'NAR' },
      { claim: 'el inventario cayo',  url: 'https://nar.realtor/informe', publisher: 'NAR' },
      { claim: 'los dias en mercado', url: 'https://nar.realtor/informe', publisher: 'NAR' },
      { claim: 'otra cosa',           url: 'https://ine.es/x',            publisher: 'INE' },
    ])
    expect(fuentes).toHaveLength(2)
    expect(fuentes.map(f => f.url)).toEqual(['https://nar.realtor/informe', 'https://ine.es/x'])
    expect(fuentes.map(f => f.id)).toEqual(['s1', 's2'])
  })

  it('title identifica a la fuente, no repite la afirmacion (spec 3.4)', () => {
    const [conMedio, sinMedio] = sourcesFromFindings([
      { claim: 'El precio medio subio 4%', url: 'https://nar.realtor/a',     publisher: 'NAR' },
      { claim: 'El inventario cayo 9%',    url: 'https://www.redfin.com/b',  publisher: '  ' },
    ])
    expect(conMedio.title).toBe('NAR')
    expect(conMedio.title).not.toContain('4%')
    // Sin publisher, lo que identifica a la fuente es su host.
    expect(sinMedio.title).toBe('redfin.com')
  })

  it('recorta published_at en vez de descartar la fuente entera', () => {
    // El esquema tope la fecha en 30 caracteres: sin recortar, una fecha larga
    // no invalida el campo, invalida la fuente.
    const [f] = sourcesFromFindings([
      { claim: 'a', url: 'https://ine.es/x', publisher: 'INE', published_at: 'F'.repeat(80) },
    ])
    expect(f).toBeDefined()
    expect(f.published_at?.length).toBeLessThanOrEqual(30)
  })

  it('recorta un publisher que excede el maximo del esquema, en vez de descartar la fuente', () => {
    const publisherLargo = 'N'.repeat(200)
    const [f] = sourcesFromFindings([
      { claim: 'dato con publisher largo', url: 'https://nar.realtor/a', publisher: publisherLargo },
    ])
    expect(f).toBeDefined()
    expect(f.publisher.length).toBeLessThanOrEqual(160)
    expect(NewsletterSourceSchema.safeParse(f).success).toBe(true)
  })

  it('descarta una url que pasa el regex laxo pero no es una URL valida', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'url rota', url: 'https://', publisher: 'X' },
      { claim: 'url valida', url: 'https://ine.es/x', publisher: 'INE' },
    ])
    expect(fuentes).toHaveLength(1)
    expect(fuentes[0].url).toBe('https://ine.es/x')
  })

  it('numera los ids consecutivos sobre las fuentes que sobreviven, no sobre el indice original', () => {
    const fuentes = sourcesFromFindings([
      { claim: 'primera', url: 'https://nar.realtor/a', publisher: 'NAR' },
      { claim: 'descartada por url invalida', url: 'https://', publisher: 'X' },
      { claim: 'tercera', url: 'https://redfin.com/b', publisher: 'Redfin' },
    ])
    expect(fuentes).toHaveLength(2)
    expect(fuentes.map(f => f.id)).toEqual(['s1', 's2'])
  })
})

describe('editionToolSchema', () => {
  // Esto es un input_schema de tool use, no el `schema` de output_config —
  // por eso SÍ puede llevar minItems/maxItems y oneOf. El test comprueba la
  // forma que draftEdition necesita, no un límite de la API (ese límite se
  // reprodujo contra la API real, no se vigila con una comprobación estática
  // sobre este esquema).
  const schema = editionToolSchema() as unknown as EditionSchemaShape

  it('exige en el nivel superior justo los campos que draftEdition lee del input', () => {
    expect(schema.type).toBe('object')
    expect(schema.required.sort()).toEqual(['blocks', 'data_as_of', 'dek', 'title'])
  })

  it('cubre los tipos de bloque que entiende NewsletterContentSchema (menos "image", que la IA no genera)', () => {
    const tipos = schema.properties.blocks.items.oneOf.map(b => b.properties.type.const)
    expect(tipos.sort()).toEqual(['callout', 'heading', 'list', 'paragraph', 'quote', 'stat'])
  })

  it('el bloque stat exige sourceIds con minItems 1 — ningún dato sin fuente', () => {
    const stat = schema.properties.blocks.items.oneOf.find(b => b.properties.type.const === 'stat')
    expect(stat).toBeDefined()
    expect(stat?.required).toContain('sourceIds')
    expect(stat?.properties.sourceIds?.minItems).toBe(1)
  })
})
