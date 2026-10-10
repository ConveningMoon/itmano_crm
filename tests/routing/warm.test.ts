import { describe, it, expect } from 'vitest'
import { INACTIVIDAD_MAX_MS, LATIDO_MS, debeLatir } from '@/lib/warm'

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
