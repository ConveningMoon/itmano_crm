import { describe, it, expect } from 'vitest'
import { sourcesFromFindings, outputSchema } from '@/lib/newsletters/ai/draft'
import { NewsletterSourceSchema } from '@/lib/newsletters/content'

/**
 * Recorre cualquier nodo del esquema JSON buscando `minItems`/`maxItems` con
 * un valor fuera de {0, 1}. La API de salida estructurada devuelve 400 ante
 * cualquiera de esos — un límite real, no una preferencia de estilo — así
 * que esta comprobación es la que hubiera cazado la regresión sin gastar una
 * llamada real a la API.
 */
function findInvalidItemBounds(node: unknown, path: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => findInvalidItemBounds(v, `${path}[${i}]`))
  }
  if (!node || typeof node !== 'object') return []
  const problemas: string[] = []
  for (const clave of ['minItems', 'maxItems'] as const) {
    const valor = (node as Record<string, unknown>)[clave]
    if (typeof valor === 'number' && valor !== 0 && valor !== 1) {
      problemas.push(`${path}.${clave} = ${valor}`)
    }
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    problemas.push(...findInvalidItemBounds(v, `${path}.${k}`))
  }
  return problemas
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

describe('outputSchema', () => {
  it('no usa minItems ni maxItems fuera de {0, 1} — la API de salida estructurada los rechaza con 400', () => {
    const problemas = findInvalidItemBounds(outputSchema(), 'schema')
    expect(problemas).toEqual([])
  })
})
