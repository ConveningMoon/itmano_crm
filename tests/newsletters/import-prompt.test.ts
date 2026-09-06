import { describe, it, expect } from 'vitest'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'
import {
  NewsletterContentSchema, NewsletterBlockSchema, NEWSLETTER_CONTENT_VERSION, CONTENT_LIMITS,
} from '@/lib/newsletters/content'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// El prompt de importación ES el contrato: lo que dice aquí es lo que el
// usuario le pide a SU IA. Si documenta algo que el servidor no acepta, el
// usuario hace exactamente lo que le dijimos y recibe un rechazo.
//
// Pasó al escribirlo: el prompt documentaba un bloque `divider` que el esquema
// no tiene. Habría roto toda importación que lo siguiera al pie de la letra.
// Este archivo existe para que no vuelva a pasar en silencio.

const prompt = buildImportPrompt()

/** Los bloques de ejemplo del prompt, extraídos del propio texto. */
function bloquesDelPrompt(): unknown[] {
  const linea = /^\s*(\{ "type".*?\}),?$/gm
  const salida: unknown[] = []
  for (const m of prompt.matchAll(linea)) {
    salida.push(JSON.parse(m[1]))
  }
  return salida
}

describe('el prompt de importación es aceptado por el esquema real', () => {
  it('extrae al menos un bloque de ejemplo del texto', () => {
    // Si esto falla es que cambió el formato del prompt y el resto de este
    // archivo estaría comprobando el vacío.
    expect(bloquesDelPrompt().length).toBeGreaterThanOrEqual(5)
  })

  it('TODOS los bloques de ejemplo validan contra NewsletterContentSchema', () => {
    const res = NewsletterContentSchema.safeParse({
      v: NEWSLETTER_CONTENT_VERSION,
      blocks: bloquesDelPrompt(),
    })
    const detalle = res.success ? '' : JSON.stringify(res.error.issues, null, 2)
    expect(res.success, detalle).toBe(true)
  })

  it('no documenta bloques de imagen — no se importan', () => {
    expect(prompt).not.toContain('"type": "image"')
    expect(prompt).toContain('NO incluyas imágenes')
  })

  it('los topes que anuncia son los que el servidor aplica', () => {
    // Escribirlos a mano aquí es como el documento y el validador se separan.
    expect(prompt).toContain(String(CONTENT_LIMITS.editionTitle))
    expect(prompt).toContain(String(CONTENT_LIMITS.statValue))
    expect(prompt).toContain(String(CONTENT_LIMITS.paragraph))
  })

  it('dice que las fuentes son opcionales', () => {
    expect(prompt).toContain('"sources" es OPCIONAL')
  })
})

// La suite de arriba pilla un bloque de EJEMPLO que el esquema rechaza (así
// cayó el "divider" que nunca existió). No pilla un valor equivocado en la
// PROSA de las reglas: "style" sólo admitía "ordered" en el texto durante
// meses y ningún ejemplo lo usaba, así que nada lo detectaba. Esta suite lee
// los valores que el prompt NOMBRA para cada campo y los valida uno por uno
// contra el esquema real.
describe('los valores de enum que el prompt nombra son los que el esquema acepta', () => {
  /**
   * Los valores citados entre comillas en la frase de reglas de `campo`
   * (p. ej. de `· "tone" sólo "info", "warning" o "success".` extrae
   * ['info', 'warning', 'success']). La primera comilla es el nombre del
   * campo, no un valor, así que se descarta.
   *
   * Busca por FRASE y no por línea porque el prompt agrupa varias reglas en
   * una sola línea (`"level" ... "style" ...`): tomar la línea entera mezclaría
   * los valores de ambos campos.
   */
  function valoresCitados(campo: string): string[] {
    // El filtro exige " sólo " además del nombre del campo: sin eso, la
    // primera línea que coincide es el JSON de EJEMPLO (que también escribe
    // `"style": "bullet"`), no la regla — y ahí no hay nada que comprobar.
    const esReglaDelCampo = (frase: string) => frase.includes(`"${campo}"`) && / sólo /.test(frase)
    for (const linea of prompt.split('\n')) {
      if (!esReglaDelCampo(linea)) continue
      const frase = linea.split(/\.\s+/).find(esReglaDelCampo)
      if (!frase) continue
      const comillas = [...frase.matchAll(/"([a-zA-Z]+)"/g)].map(m => m[1])
      return comillas.slice(1)
    }
    throw new Error(`No encontré una regla para "${campo}" en el prompt.`)
  }

  it('cada valor de "style" que el prompt promete es aceptado por el bloque list', () => {
    const valores = valoresCitados('style')
    expect(valores.length).toBeGreaterThan(0)
    for (const valor of valores) {
      const res = NewsletterBlockSchema.safeParse({ type: 'list', style: valor, items: ['x'] })
      expect(res.success, `el prompt promete "${valor}" como "style" pero el esquema lo rechaza`).toBe(true)
    }
  })

  it('cada valor de "tone" que el prompt promete es aceptado por el bloque callout', () => {
    const valores = valoresCitados('tone')
    expect(valores.length).toBeGreaterThan(0)
    for (const valor of valores) {
      const res = NewsletterBlockSchema.safeParse({ type: 'callout', tone: valor, text: 'x' })
      expect(res.success, `el prompt promete "${valor}" como "tone" pero el esquema lo rechaza`).toBe(true)
    }
  })

  // Un campo que el esquema NO declara no hace fallar nada: zod lo descarta y
  // sigue. Por eso el prompt prometía "sourceIds" en cualquier bloque y nadie
  // se enteraba — la cita simplemente no llegaba a la edición.
  const MINIMOS: Record<string, Record<string, unknown>> = {
    heading:   { type: 'heading', level: 2, text: 'x' },
    paragraph: { type: 'paragraph', text: 'x' },
    list:      { type: 'list', style: 'bullet', items: ['x'] },
    quote:     { type: 'quote', text: 'x' },
    callout:   { type: 'callout', tone: 'info', text: 'x' },
    stat:      { type: 'stat', label: 'x', value: 'y' },
  }

  /** Los tipos que de verdad CONSERVAN "sourceIds" al pasar por el esquema. */
  function tiposQueCitan(): string[] {
    return Object.keys(MINIMOS).filter(tipo => {
      const res = NewsletterBlockSchema.safeParse({ ...MINIMOS[tipo], sourceIds: ['s1'] })
      return res.success && 'sourceIds' in (res.data as object)
    })
  }

  it('nombra exactamente los bloques que conservan "sourceIds"', () => {
    const citan = tiposQueCitan()
    // Si MINIMOS deja de ser válido, todo daría vacío y el resto pasaría solo.
    expect(citan.length).toBeGreaterThan(0)

    // El '·' distingue la REGLA del JSON de ejemplo, que también escribe
    // `"sourceIds": ["s1"]` y aparece antes: sin eso se compara contra el
    // ejemplo del bloque paragraph y el resultado no significa nada.
    const regla = prompt.split('\n')
      .find(l => l.includes('sourceIds') && l.trimStart().startsWith('·'))
    expect(regla, 'el prompt ya no explica "sourceIds"').toBeDefined()

    for (const tipo of Object.keys(MINIMOS)) {
      const nombrado = regla!.includes(`"${tipo}"`)
      expect(nombrado, nombrado
        ? `el prompt dice que "${tipo}" cita fuentes, pero el esquema le descarta "sourceIds"`
        : `"${tipo}" conserva "sourceIds" y el prompt no lo nombra`,
      ).toBe(citan.includes(tipo))
    }
  })

  it('cada código de idioma que promete es uno que el servidor acepta', () => {
    const linea = prompt.split('\n').find(l => l.includes('"language"') && l.includes('códigos:'))
    expect(linea, 'el prompt ya no lista los idiomas').toBeDefined()

    const codigos = linea!.split('códigos:')[1].replace(/\.\s*$/, '').split(',').map(c => c.trim()).filter(Boolean)
    expect(codigos.length).toBeGreaterThan(0)
    for (const codigo of codigos) {
      expect((SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(codigo),
        `el prompt promete el idioma "${codigo}" pero el servidor lo rechaza`).toBe(true)
    }
  })
})
