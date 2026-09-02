import { describe, it, expect } from 'vitest'
import { jsonLdScriptBody } from '@/app/(hosted)/nl/[tenantSlug]/[editionSlug]/edition-jsonld'

// `jsonLdScriptBody` es lo único que se interpone entre un título de edición
// (texto que la IA redacta a partir de resultados de búsqueda web, o que
// escribe el propio tenant — no pasa por el saneamiento de
// `renderNewsletterHtml`) y un <script type="application/ld+json"> que se
// sirve a CUALQUIER visitante de la página pública. Sin este escape, un
// título que contenga literalmente `</script><script>...` cierra el tag
// antes de tiempo y el resto se ejecuta como HTML/JS de la página — un XSS
// que afecta a todo el mundo, no sólo a quien escribió el título.
//
// Este test demuestra el agujero cerrado: si alguien "simplifica" la función
// de vuelta a un `JSON.stringify` a secas, este test falla.

describe('jsonLdScriptBody', () => {
  it('escapa una secuencia de cierre de script para que no rompa el tag', () => {
    const payload = {
      headline: 'Título </script><script>alert(1)</script> malicioso',
    }
    const body = jsonLdScriptBody(payload)

    expect(body).not.toContain('</script>')
    expect(body).not.toContain('<script>')
  })

  it('sigue siendo JSON válido y decodifica al valor original', () => {
    const payload = {
      headline: 'Título </script><script>alert(1)</script> malicioso',
      description: 'Ampersand & signo > y < sueltos',
    }
    const body = jsonLdScriptBody(payload)

    expect(JSON.parse(body)).toEqual(payload)
  })

  it('sin caracteres peligrosos, el JSON queda intacto', () => {
    const payload = { headline: 'Un título normal', count: 3, ok: true }
    expect(JSON.parse(jsonLdScriptBody(payload))).toEqual(payload)
  })
})
