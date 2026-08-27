import { describe, it, expect } from 'vitest'
import { buildImportPrompt } from '@/lib/newsletters/import-prompt'
import {
  NewsletterContentSchema, NEWSLETTER_CONTENT_VERSION, CONTENT_LIMITS,
} from '@/lib/newsletters/content'

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
