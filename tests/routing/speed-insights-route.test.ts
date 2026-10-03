import { describe, it, expect } from 'vitest'
import { rutaConPatron } from '@/lib/speed-insights'

describe('rutaConPatron', () => {
  it('sustituye el id por el nombre del parámetro', () => {
    expect(rutaConPatron('/leads/3f2c9a1e-0000-4000-8000-000000000001', { id: '3f2c9a1e-0000-4000-8000-000000000001' }))
      .toBe('/leads/[id]')
  })

  it('las rutas sin parámetros quedan igual', () => {
    expect(rutaConPatron('/dashboard', {})).toBe('/dashboard')
  })

  it('sólo sustituye segmentos completos', () => {
    // "lead" no debe comerse el "leads" de la ruta.
    expect(rutaConPatron('/leads/lead', { id: 'lead' })).toBe('/leads/[id]')
    expect(rutaConPatron('/sources/abc/stats', { slug: 'abc' })).toBe('/sources/[slug]/stats')
  })

  it('resuelve catch-all como bloque', () => {
    expect(rutaConPatron('/web/acme/casa-azul', { parts: ['acme', 'casa-azul'] })).toBe('/web/[...parts]')
  })

  it('sin pathname o sin params devuelve lo que hay', () => {
    expect(rutaConPatron(null, { id: 'x' })).toBeNull()
    expect(rutaConPatron('/leads', null)).toBe('/leads')
  })
})
