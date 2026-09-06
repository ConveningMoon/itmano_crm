import { describe, it, expect } from 'vitest'
import {
  compareByPriority,
  formatPosition,
  qualityRank,
  isActiveStage,
  QUALITY_BANDS,
  POSITION_ABSOLUTE_MAX,
  type PriorityInput,
} from '@/lib/scoring/priority'

const lead = (urgencyRank: number, qualityBand: PriorityInput['qualityBand'], id = 'a'): PriorityInput =>
  ({ urgencyRank, qualityBand, id })

describe('compareByPriority — lexicográfico', () => {
  it('la urgencia manda sobre la calidad', () => {
    // Un lead flojo que caduca hoy va antes que uno excelente sin prisa.
    const urgentePeroFlojo = lead(0, 'baja')
    const excelenteSinPrisa = lead(2, 'alta')
    expect(compareByPriority(urgentePeroFlojo, excelenteSinPrisa)).toBeLessThan(0)
  })

  it('dentro de la misma urgencia, gana la mejor calidad', () => {
    expect(compareByPriority(lead(0, 'alta'), lead(0, 'media'))).toBeLessThan(0)
    expect(compareByPriority(lead(0, 'media_baja'), lead(0, 'media_alta'))).toBeGreaterThan(0)
  })

  it('los leads fuera de la cola quedan al final', () => {
    const enProceso = lead(9, 'alta')
    const activoFlojo = lead(2, 'baja')
    expect(compareByPriority(activoFlojo, enProceso)).toBeLessThan(0)
  })

  it('es estable: desempata por id', () => {
    const a = lead(1, 'media', 'lead-aaa')
    const b = lead(1, 'media', 'lead-bbb')
    expect(compareByPriority(a, b)).not.toBe(0)
    // Antisimétrico — sin esto el orden puede saltar entre peticiones.
    expect(Math.sign(compareByPriority(a, b))).toBe(-Math.sign(compareByPriority(b, a)))
  })

  it('ordena una cartera completa como se espera', () => {
    const cartera = [
      lead(2, 'alta',       'l1'),
      lead(0, 'baja',       'l2'),
      lead(9, 'alta',       'l3'),
      lead(0, 'media_alta', 'l4'),
      lead(1, 'alta',       'l5'),
    ]
    const orden = [...cartera].sort(compareByPriority).map(l => l.id)
    expect(orden).toEqual(['l4', 'l2', 'l5', 'l1', 'l3'])
  })
})

describe('qualityRank', () => {
  it('alta es la mejor y baja la peor', () => {
    expect(qualityRank('alta')).toBe(0)
    expect(qualityRank('baja')).toBe(QUALITY_BANDS.length - 1)
  })

  it('el orden del array define el orden de calidad', () => {
    const rangos = QUALITY_BANDS.map(qualityRank)
    expect(rangos).toEqual([...rangos].sort((a, b) => a - b))
  })
})

describe('isActiveStage', () => {
  it('solo nuevo y nutrición compiten por la atención', () => {
    expect(isActiveStage('nuevo')).toBe(true)
    expect(isActiveStage('nutricion')).toBe(true)
    expect(isActiveStage('en_proceso')).toBe(false)
    expect(isActiveStage('cerrado')).toBe(false)
    expect(isActiveStage('perdido')).toBe(false)
    expect(isActiveStage(null)).toBe(false)
  })
})

describe('formatPosition', () => {
  it('con cartera pequeña muestra la posición absoluta', () => {
    expect(formatPosition(2, 34)?.text).toBe('#2 de 34 activos')
  })

  it('marca el 20% superior', () => {
    expect(formatPosition(2, 34)?.top).toBe(true)     // 5.8%
    expect(formatPosition(30, 34)?.top).toBe(false)   // 88%
    expect(formatPosition(20, 100)?.top).toBe(true)   // justo el 20%
    expect(formatPosition(21, 100)?.top).toBe(false)
  })

  it('con cartera grande cambia a percentil — "#247 de 1000" no informa', () => {
    expect(formatPosition(247, 1000)?.text).toBe('top 25% de tu cartera')
  })

  it('redondea el percentil hacia arriba para no prometer de más', () => {
    // 42/1000 = 4.2% → se muestra 5%, nunca 4%.
    expect(formatPosition(42, 1000)?.text).toBe('top 5% de tu cartera')
  })

  it('nunca muestra "top 0%"', () => {
    expect(formatPosition(1, 5000)?.text).toBe('top 1% de tu cartera')
  })

  it('el corte entre los dos formatos es POSITION_ABSOLUTE_MAX', () => {
    expect(formatPosition(1, POSITION_ABSOLUTE_MAX)?.text).toContain('de 100 activos')
    expect(formatPosition(1, POSITION_ABSOLUTE_MAX + 1)?.text).toContain('top ')
  })

  it('devuelve null sin cartera o con rango inválido', () => {
    expect(formatPosition(1, 0)).toBeNull()
    expect(formatPosition(0, 10)).toBeNull()
  })
})
