import { describe, it, expect } from 'vitest'
import { INACTIVIDAD_MAX_MS, LATIDO_MS, RENOVAR_SESION_MS, VUELTA_MS, debeLatir, debeRenovarSesion, esLatidoDeVuelta } from '@/lib/warm'

const base = { ahora: 1_000_000, ultimoLatido: 0, ultimaActividad: 1_000_000, visible: true, enLinea: true }

describe('debeLatir', () => {
  it('late si la pestaña está a la vista, hay actividad reciente y toca', () => {
    expect(debeLatir(base)).toBe(true)
  })

  it('respeta la separación mínima entre latidos', () => {
    expect(debeLatir({ ...base, ultimoLatido: base.ahora - (LATIDO_MS - 1) })).toBe(false)
    expect(debeLatir({ ...base, ultimoLatido: base.ahora - LATIDO_MS })).toBe(true)
  })

  it('no late con la pestaña oculta ni sin red', () => {
    expect(debeLatir({ ...base, visible: false })).toBe(false)
    expect(debeLatir({ ...base, enLinea: false })).toBe(false)
  })

  it('se detiene cuando la persona lleva demasiado sin hacer nada', () => {
    expect(debeLatir({ ...base, ultimaActividad: base.ahora - INACTIVIDAD_MAX_MS })).toBe(true)
    expect(debeLatir({ ...base, ultimaActividad: base.ahora - INACTIVIDAD_MAX_MS - 1 })).toBe(false)
  })

  it('al volver a tener actividad tras una pausa larga, vuelve a latir', () => {
    const parado = { ...base, ultimoLatido: base.ahora - 10 * 60_000, ultimaActividad: base.ahora - 10 * 60_000 }
    expect(debeLatir(parado)).toBe(false)
    expect(debeLatir({ ...parado, ultimaActividad: base.ahora })).toBe(true)
  })
})

describe('debeRenovarSesion', () => {
  const ahora = 1_800_000_000_000
  const expDentroDe = (ms: number) => (ahora + ms) / 1000

  it('un token recién emitido (1 h) no se renueva', () => {
    expect(debeRenovarSesion(expDentroDe(60 * 60_000), ahora)).toBe(false)
  })

  it('se renueva en cuanto le quedan menos de 45 minutos', () => {
    expect(debeRenovarSesion(expDentroDe(RENOVAR_SESION_MS), ahora)).toBe(false)
    expect(debeRenovarSesion(expDentroDe(RENOVAR_SESION_MS - 1000), ahora)).toBe(true)
  })

  it('un token caducado también se renueva', () => {
    expect(debeRenovarSesion(expDentroDe(-60_000), ahora)).toBe(true)
  })

  it('sin exp no se renueva', () => {
    expect(debeRenovarSesion(undefined, ahora)).toBe(false)
  })
})

describe('esLatidoDeVuelta', () => {
  const ahora = 1_800_000_000_000

  it('el primer latido tras cargar la página no lo es: la carga ya hizo ese camino', () => {
    expect(esLatidoDeVuelta(ahora, 0)).toBe(false)
  })

  it('los latidos seguidos no lo son', () => {
    expect(esLatidoDeVuelta(ahora, ahora - LATIDO_MS)).toBe(false)
    expect(esLatidoDeVuelta(ahora, ahora - (VUELTA_MS - 1))).toBe(false)
  })

  it('el primer latido tras una pausa sí lo es', () => {
    expect(esLatidoDeVuelta(ahora, ahora - VUELTA_MS)).toBe(true)
    expect(esLatidoDeVuelta(ahora, ahora - 60 * 60_000)).toBe(true)
  })
})
