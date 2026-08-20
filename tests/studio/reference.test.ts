import { describe, it, expect } from 'vitest'
import {
  GRUPOS, IMAGENES, TEXTOS, SPECS, FRAGMENTOS, VARIABLES,
  CLASES_DE_ESTADO, rutaEnElRepo,
} from '@/lib/studio/templates/reference'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { sampleProps } from '@/lib/studio/sample-data'
import { MOCKUP_SLOTS } from '@/lib/studio/mockups'
import type { TemplateProps } from '@/lib/studio/templates/types'

// La chuleta que ensena el editor no puede quedarse vieja en silencio: si
// alguien anade una clave al motor y no la documenta, quien disene no sabra que
// existe y no la usara nunca. Esto lo cruza contra lo que el motor EMITE.

/** Un escenario con todo relleno, para que el motor emita cuanto sabe emitir. */
function propsCompletas(): TemplateProps {
  const base = sampleProps('new_listing', 'completo')
  return {
    ...base,
    // La venta de ejemplo no trae estos dos; se anaden para que el cruce cubra
    // TODAS las claves del contrato, no solo las de una receta.
    when: '15 de agosto de 2026 · 11:00–14:00',
    cta:  'Regístrate en itmano.com/eventos',
  }
}

const documentadas = new Set(GRUPOS.flatMap(g => g.claves.map(c => c.clave)))

describe('la chuleta cubre lo que el motor emite', () => {
  it('todas las claves de valor estan documentadas', () => {
    const emitidas = Object.keys(templateValues(propsCompletas()))
    const sinDocumentar = emitidas.filter(k => !documentadas.has(k))
    expect(sinDocumentar, `claves que el motor emite y la chuleta no explica: ${sinDocumentar}`).toEqual([])
  })

  it('todos los fragmentos raw estan documentados', () => {
    const emitidos = Object.keys(templateRawValues(propsCompletas()))
    expect(emitidos.filter(k => !documentadas.has(k))).toEqual([])
  })

  it('todas las variables de color estan documentadas', () => {
    const emitidas = Object.keys(paletteVars(propsCompletas().palette))
    const sinDocumentar = emitidas.filter(k => !documentadas.has(k))
    expect(sinDocumentar, `variables sin documentar: ${sinDocumentar}`).toEqual([])
  })

  it('todas las clases de estado estan documentadas', () => {
    // Las contadas (fotos-N, datos-N) se documentan con la N, no una por una.
    const documentadasClases = new Set(CLASES_DE_ESTADO.map(c => c.clave))
    const emitidas = templateFlags(sampleProps('new_listing', 'minimo'))
      .map(c => c.replace(/-\d+$/, '-N'))
    const sinDocumentar = emitidas.filter(c => !documentadasClases.has(c))
    expect(sinDocumentar, `clases sin documentar: ${sinDocumentar}`).toEqual([])
  })

  it('no documenta claves que el motor NO emite', () => {
    // Al reves tambien importa: una clave documentada que no existe manda a
    // quien disena a escribir un hueco que siempre saldra vacio.
    const emitidas = new Set([
      ...Object.keys(templateValues(propsCompletas())),
      ...Object.keys(templateRawValues(propsCompletas())),
      ...Object.keys(paletteVars(propsCompletas().palette)),
      'w', 'h',   // el tamano del lienzo lo pone buildTemplateDocument, no values
    ])
    const inventadas = [...documentadas].filter(k => !emitidas.has(k))
    expect(inventadas, `documentadas pero inexistentes: ${inventadas}`).toEqual([])
  })
})

describe('forma de la chuleta', () => {
  it('cada grupo dice como se escribe y no llega vacio', () => {
    for (const g of GRUPOS) {
      expect(g.titulo.length, g.titulo).toBeGreaterThan(0)
      expect(g.forma.length, g.titulo).toBeGreaterThan(0)
      expect(g.claves.length, g.titulo).toBeGreaterThan(0)
    }
  })

  it('cada clave explica que pinta', () => {
    for (const g of GRUPOS) {
      for (const c of g.claves) expect(c.que.length, `${g.titulo}/${c.clave}`).toBeGreaterThan(0)
    }
  })

  it('las imagenes documentadas son las mismas que el panel deja cambiar', () => {
    expect(IMAGENES.claves.map(c => c.clave)).toEqual(MOCKUP_SLOTS.map(s => s.key))
  })

  it('los grupos son los cinco esperados', () => {
    expect(GRUPOS).toEqual([IMAGENES, TEXTOS, SPECS, FRAGMENTOS, VARIABLES])
  })
})

describe('rutaEnElRepo', () => {
  it('apunta a los archivos reales del diseno', () => {
    expect(rutaEnElRepo('mosaico-listing')).toEqual({
      html: 'src/lib/studio/templates/seed/mosaico-listing/template.html',
      css:  'src/lib/studio/templates/seed/mosaico-listing/template.css',
    })
  })

  it('sin clave deja un hueco visible en vez de una ruta rota', () => {
    expect(rutaEnElRepo('').html).toContain('<clave>')
  })
})
