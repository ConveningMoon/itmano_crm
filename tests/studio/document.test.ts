import { describe, it, expect } from 'vitest'
import {
  buildTemplateDocument, resolveSections, interpolate, escapeHtml,
} from '@/lib/studio/templates/document'

const base = {
  css: '.x{color:red}', rawValues: {}, vars: {}, flags: [], fontFaceCss: '', width: 1080, height: 1350,
}

describe('resolveSections', () => {
  it('conserva el bloque cuando el dato existe', () => {
    expect(resolveSections('<p>{{#price}}vale {{price}}{{/price}}</p>', { price: '$10' }))
      .toBe('<p>vale {{price}}</p>')
  })

  it('borra el bloque entero cuando el dato falta', () => {
    expect(resolveSections('<p>{{#price}}vale {{price}}{{/price}}</p>', {}))
      .toBe('<p></p>')
  })

  it('trata la cadena vacía como dato ausente', () => {
    expect(resolveSections('{{#cta}}x{{/cta}}', { cta: '' })).toBe('')
  })

  it('resuelve varias secciones distintas de forma independiente', () => {
    const html = '{{#a}}A{{/a}}|{{#b}}B{{/b}}'
    expect(resolveSections(html, { a: '1' })).toBe('A|')
  })

  it('resuelve todas las apariciones de la misma seccion', () => {
    expect(resolveSections('{{#a}}1{{/a}}{{#a}}2{{/a}}', {})).toBe('')
  })

  it('un fragmento raw tambien cuenta como dato presente', () => {
    expect(resolveSections('{{#ritmo}}<h1>{{&ritmo}}</h1>{{/ritmo}}', { ritmo: '<span>x</span>' }))
      .toBe('<h1>{{&ritmo}}</h1>')
  })
})

describe('interpolate', () => {
  it('sustituye el valor', () => {
    expect(interpolate('<h1>{{headline}}</h1>', { headline: 'Casa' }, {})).toBe('<h1>Casa</h1>')
  })

  it('deja vacio el hueco sin dato en vez de imprimir la llave', () => {
    expect(interpolate('<h1>{{headline}}</h1>', {}, {})).toBe('<h1></h1>')
  })

  it('escapa el HTML del dato', () => {
    expect(interpolate('<p>{{address}}</p>', { address: 'A & B <script>' }, {}))
      .toBe('<p>A &amp; B &lt;script&gt;</p>')
  })

  it('no rompe un data URI', () => {
    const uri = 'data:image/jpeg;base64,AAAA'
    expect(interpolate('<img src="{{hero}}">', { hero: uri }, {})).toBe(`<img src="${uri}">`)
  })

  it('inserta un fragmento raw sin escaparlo', () => {
    expect(interpolate('<h1>{{&ritmo}}</h1>', {}, { ritmo: '<span>Casa</span>' }))
      .toBe('<h1><span>Casa</span></h1>')
  })

  it('un raw ausente no imprime la llave', () => {
    expect(interpolate('<h1>{{&ritmo}}</h1>', {}, {})).toBe('<h1></h1>')
  })
})

describe('escapeHtml', () => {
  it('escapa los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('buildTemplateDocument', () => {
  it('pone las clases de estado en el html', () => {
    const doc = buildTemplateDocument({ ...base, html: '<i></i>', values: {}, flags: ['sin-precio', 'fotos-2'] })
    expect(doc).toContain('<html class="sin-precio fotos-2">')
  })

  it('declara las variables de color en :root', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, vars: { brand: '#1B2A41' } })
    expect(doc).toContain('--brand:#1B2A41')
  })

  it('declara el tamano del lienzo', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {} })
    expect(doc).toContain('--w:1080px')
    expect(doc).toContain('--h:1350px')
  })

  it('mete el css del autor DESPUES del reset para que pueda pisarlo', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, css: '.mio{color:blue}' })
    expect(doc.indexOf('box-sizing')).toBeLessThan(doc.indexOf('.mio{color:blue}'))
  })

  it('mete las fuentes antes que todo lo demas', () => {
    const doc = buildTemplateDocument({ ...base, html: '', values: {}, fontFaceCss: '@font-face{font-family:X}' })
    expect(doc.indexOf('@font-face')).toBeLessThan(doc.indexOf('box-sizing'))
  })

  it('resuelve secciones ANTES de sustituir, no al reves', () => {
    // Si sustituyera primero, {{#price}} quedaria intacto y el bloque saldria.
    const doc = buildTemplateDocument({ ...base, html: '{{#price}}<b>{{price}}</b>{{/price}}', values: {} })
    expect(doc).not.toContain('<b>')
  })

  it('inserta los fragmentos raw en el cuerpo', () => {
    const doc = buildTemplateDocument({
      ...base, html: '<h1>{{&ritmo}}</h1>', values: {}, rawValues: { ritmo: '<em>Casa</em>' },
    })
    expect(doc).toContain('<h1><em>Casa</em></h1>')
  })

  it('emite un documento completo', () => {
    const doc = buildTemplateDocument({ ...base, html: '<main>x</main>', values: {} })
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain('<body><main>x</main></body>')
  })
})
