import { describe, it, expect } from 'vitest'
import { parseInaccessibleDomains } from '@/lib/newsletters/ai/research'
import { GLOBAL_SOURCE_DOMAINS } from '@/lib/newsletters/ai/source-catalog'

// `allowed_domains` se valida ANTES de inferir: un solo dominio que bloquee al
// rastreador de Anthropic tumba la llamada entera con un 400. Poder leer QUÉ
// dominios son es lo que convierte ese fallo en una poda y un reintento en vez
// de en una feature muerta.

// El mensaje real que devolvió la API en la primera generación de producción.
const ERROR_REAL =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":' +
  '"The following domains are not accessible to our user agent: ' +
  "['apnews.com', 'nytimes.com', 'pilotonline.com', 'realtor.com', 'reuters.com', " +
  "'richmond.com', 'wsj.com']. Read more: https://support.anthropic.com/en/articles/" +
  '8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler"},' +
  '"request_id":"req_011CeT19aweYXYNhBnrLoeMn"}'

describe('parseInaccessibleDomains', () => {
  it('saca los siete dominios del error real de producción', () => {
    expect(parseInaccessibleDomains(new Error(ERROR_REAL))).toEqual([
      'apnews.com', 'nytimes.com', 'pilotonline.com', 'realtor.com',
      'reuters.com', 'richmond.com', 'wsj.com',
    ])
  })

  it('no se traga la URL de soporte que viene detrás', () => {
    // El mensaje termina con un enlace a support.anthropic.com; colarlo en la
    // poda quitaría un dominio que nadie pidió quitar.
    expect(parseInaccessibleDomains(new Error(ERROR_REAL))).not.toContain('support.anthropic.com')
  })

  it('acepta el error como string o como Error', () => {
    expect(parseInaccessibleDomains(ERROR_REAL).length).toBe(7)
  })

  it('devuelve vacío para cualquier otro error — ahí no hay nada que podar', () => {
    expect(parseInaccessibleDomains(new Error('rate_limit_error'))).toEqual([])
    expect(parseInaccessibleDomains(new Error('overloaded_error'))).toEqual([])
    expect(parseInaccessibleDomains(null)).toEqual([])
    expect(parseInaccessibleDomains(undefined)).toEqual([])
    expect(parseInaccessibleDomains({ mensaje: 'algo' })).toEqual([])
  })
})

describe('GLOBAL_SOURCE_DOMAINS', () => {
  it('no contiene prensa que bloquee al rastreador', () => {
    // Reuters y AP estaban aquí y tumbaron la primera generación real. El suelo
    // es la parte que NO puede fallar: sólo organismos públicos, que no
    // bloquean rastreadores.
    const bloqueados = ['reuters.com', 'apnews.com', 'nytimes.com', 'wsj.com', 'ft.com']
    for (const d of bloqueados) expect(GLOBAL_SOURCE_DOMAINS).not.toContain(d)
  })

  it('sigue teniendo suficientes fuentes para que la lista nunca quede vacía', () => {
    expect(GLOBAL_SOURCE_DOMAINS.length).toBeGreaterThanOrEqual(4)
  })
})
