import { describe, it, expect } from 'vitest'
import { esNavegacionInterna, esVersionDistinta } from '@/lib/app-version'

const ACTUAL = 'https://app.itmano.com/leads?stage=nuevo'
const clicNormal = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
const enlace = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) =>
  ({ href, target: '', download: false, ...extra })

describe('esVersionDistinta', () => {
  it('detecta otro deploy', () => {
    expect(esVersionDistinta('dpl_a', 'dpl_b')).toBe(true)
  })

  it('el mismo deploy no avisa', () => {
    expect(esVersionDistinta('dpl_a', 'dpl_a')).toBe(false)
  })

  it('una respuesta vacía o rara nunca dispara el aviso', () => {
    expect(esVersionDistinta('dpl_a', null)).toBe(false)
    expect(esVersionDistinta('dpl_a', undefined)).toBe(false)
    expect(esVersionDistinta('dpl_a', '')).toBe(false)
    expect(esVersionDistinta('dpl_a', 42)).toBe(false)
  })
})

describe('esNavegacionInterna', () => {
  it('un clic normal a otra página del CRM se convierte en carga completa', () => {
    expect(esNavegacionInterna(clicNormal, enlace('/dashboard'), ACTUAL)).toBe(true)
    expect(esNavegacionInterna(clicNormal, enlace('https://app.itmano.com/leads/123'), ACTUAL)).toBe(true)
    // Misma ruta con otros filtros también es otra vista.
    expect(esNavegacionInterna(clicNormal, enlace('/leads?stage=cerrado'), ACTUAL)).toBe(true)
  })

  it('abrir en otra pestaña se respeta', () => {
    for (const tecla of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      expect(esNavegacionInterna({ ...clicNormal, [tecla]: true }, enlace('/dashboard'), ACTUAL)).toBe(false)
    }
    expect(esNavegacionInterna({ ...clicNormal, button: 1 }, enlace('/dashboard'), ACTUAL)).toBe(false)
    expect(esNavegacionInterna(clicNormal, enlace('/dashboard', { target: '_blank' }), ACTUAL)).toBe(false)
  })

  it('target _self sigue siendo navegación interna', () => {
    expect(esNavegacionInterna(clicNormal, enlace('/dashboard', { target: '_self' }), ACTUAL)).toBe(true)
  })

  it('descargas, otros orígenes y protocolos no se tocan', () => {
    expect(esNavegacionInterna(clicNormal, enlace('/api/export.csv', { download: true }), ACTUAL)).toBe(false)
    expect(esNavegacionInterna(clicNormal, enlace('https://example.com/x'), ACTUAL)).toBe(false)
    expect(esNavegacionInterna(clicNormal, enlace('mailto:lead@example.com'), ACTUAL)).toBe(false)
  })

  it('un ancla en la misma página no recarga', () => {
    expect(esNavegacionInterna(clicNormal, enlace('/leads?stage=nuevo#tabla'), ACTUAL)).toBe(false)
    expect(esNavegacionInterna(clicNormal, enlace('#tabla'), ACTUAL)).toBe(false)
  })

  it('un clic que ya canceló otro manejador no se toca', () => {
    expect(esNavegacionInterna({ ...clicNormal, defaultPrevented: true }, enlace('/dashboard'), ACTUAL)).toBe(false)
  })
})
