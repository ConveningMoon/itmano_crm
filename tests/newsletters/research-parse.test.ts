import { describe, it, expect } from 'vitest'
import { extractSearchCount, collectSearchErrors, assertSearchInfraOk } from '@/lib/newsletters/ai/research'

// Forma real de un bloque de resultado con ÉXITO: `content` es una LISTA.
const bloqueOk = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_1',
  content: [
    { type: 'web_search_result', title: 'Informe', url: 'https://nar.realtor/a' },
    { type: 'web_search_result', title: 'Otro',    url: 'https://nar.realtor/b' },
  ],
}

// Forma real de un bloque con ERROR: `content` es un OBJETO. Llega con HTTP 200,
// no como excepcion.
const bloqueError = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_2',
  content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
}

describe('extractSearchCount', () => {
  it('cuenta un bloque de exito por busqueda realizada', () => {
    expect(extractSearchCount([bloqueOk])).toBe(1)
    expect(extractSearchCount([bloqueOk, bloqueOk, bloqueOk])).toBe(3)
  })

  it('no cuenta los bloques de error: una busqueda fallida no se factura', () => {
    expect(extractSearchCount([bloqueOk, bloqueError])).toBe(1)
  })

  it('ignora los bloques que no son de busqueda', () => {
    expect(extractSearchCount([{ type: 'text', text: 'hola' }, bloqueOk])).toBe(1)
  })

  it('devuelve 0 ante basura, sin lanzar', () => {
    expect(extractSearchCount([])).toBe(0)
    expect(extractSearchCount([null, undefined, 'x', 42])).toBe(0)
  })
})

describe('collectSearchErrors', () => {
  it('saca los codigos de error de los bloques fallidos', () => {
    expect(collectSearchErrors([bloqueOk, bloqueError])).toEqual(['max_uses_exceeded'])
  })

  it('no confunde una lista de resultados con un error', () => {
    expect(collectSearchErrors([bloqueOk])).toEqual([])
  })

  it('devuelve vacio ante basura', () => {
    expect(collectSearchErrors([null, 'x', {}])).toEqual([])
  })
})

// Cubre la distincion entre "el modelo no busco" (no es fallo) y "la
// herramienta fallo del todo" (si es fallo, y su codigo no se puede perder).
describe('assertSearchInfraOk', () => {
  it('no lanza si hubo al menos una busqueda con exito', () => {
    expect(() => assertSearchInfraOk(1, [])).not.toThrow()
    expect(() => assertSearchInfraOk(3, ['max_uses_exceeded'])).not.toThrow()
  })

  it('no lanza si no hubo busquedas ni errores: el modelo decidio no buscar', () => {
    expect(() => assertSearchInfraOk(0, [])).not.toThrow()
  })

  it('lanza si no hubo busquedas con exito pero si hubo errores', () => {
    expect(() => assertSearchInfraOk(0, ['max_uses_exceeded'])).toThrow(/max_uses_exceeded/)
  })

  it('el mensaje trae todos los codigos de error, no solo el primero', () => {
    expect(() => assertSearchInfraOk(0, ['max_uses_exceeded', 'unavailable']))
      .toThrow(/max_uses_exceeded.*unavailable/)
  })
})
