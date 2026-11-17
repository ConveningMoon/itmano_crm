import { describe, it, expect } from 'vitest'
import { acceptsManualActions, ACTIVE_STAGES } from '@/lib/scoring/priority'

// Las visitas, propuestas y citas ocurren sobre todo con el lead En proceso.
// El panel reutilizaba ACTIVE_STAGES (Nuevo y Nutrición) y quedaba bloqueado
// justo en esa etapa.

describe('acceptsManualActions', () => {
  it('admite Nuevo, Nutrición y En proceso', () => {
    expect(acceptsManualActions('nuevo')).toBe(true)
    expect(acceptsManualActions('nutricion')).toBe(true)
    expect(acceptsManualActions('en_proceso')).toBe(true)
  })

  it('rechaza Cerrado, Perdido y valores desconocidos', () => {
    expect(acceptsManualActions('cerrado')).toBe(false)
    expect(acceptsManualActions('perdido')).toBe(false)
    expect(acceptsManualActions(null)).toBe(false)
    expect(acceptsManualActions('otra')).toBe(false)
  })

  it('no cambia la cartera activa (bandas, cola de hoy, secuencias por etiqueta)', () => {
    expect(ACTIVE_STAGES).toEqual(['nuevo', 'nutricion'])
  })
})
