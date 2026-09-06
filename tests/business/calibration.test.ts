import { describe, it, expect } from 'vitest'
import {
  calibratableDimensions, currentOrder, recalibrate, type CalibrationRule,
} from '@/lib/scoring/calibration'
import { computeScoreReach, type ReachRule } from '@/lib/scoring/reach'
import { BUY_DIMS } from '@/lib/scoring/vocabulary'

// Las reglas de fit reales de la base (consultadas por la service-role key),
// recortadas a las dimensiones de compra.
const fit = (dimension: string, matchValue: string, points: number): CalibrationRule =>
  ({ category: 'fit', dimension, matchValue, points, isActive: true })

const REGLAS: CalibrationRule[] = [
  fit('timeline', 'under_3_months', 30),
  fit('timeline', '3_6_months', 15),
  fit('timeline', '6_12_months', 5),
  fit('timeline', 'over_12_explorando', 0),
  fit('financing', 'cash', 25),
  fit('financing', 'preapproved', 20),
  fit('financing', 'in_process', 10),
  fit('financing', 'not_started', 0),
  fit('budget_tier', 'premium', 20),
  fit('budget_tier', 'mid', 12),
  fit('budget_tier', 'entry', 5),
  fit('budget_tier', 'undefined', 0),
  fit('agent_status', 'sin_agente', 5),
  fit('agent_status', 'con_agente', -15),
  fit('contingency', 'sin_contingencia', 5),
  fit('contingency', 'con_contingencia', -10),
  fit('geo_fit', 'zona_principal', 5),
  fit('geo_fit', 'zona_secundaria', 0),
  fit('geo_fit', 'fuera_de_zona', -10),
  fit('property_use', 'vivienda_principal', 0),
  fit('property_use', 'segunda_vivienda', 0),
  fit('property_use', 'inversion', 0),
]

/** Aplica los cambios sobre las reglas para poder medirlas de nuevo. */
function aplicar(reglas: CalibrationRule[], orden: string[]): CalibrationRule[] {
  const cambios = new Map(recalibrate(reglas, orden).map(c => [`${c.dimension}::${c.matchValue}`, c.to]))
  return reglas.map(r => {
    const nuevo = cambios.get(`${r.dimension}::${r.matchValue}`)
    return nuevo === undefined ? r : { ...r, points: nuevo }
  })
}

const asReach = (rs: CalibrationRule[]): ReachRule[] =>
  rs.map(r => ({ category: r.category, dimension: r.dimension, points: r.points, isActive: r.isActive }))

describe('calibratableDimensions', () => {
  it('deja fuera property_use, que no suma', () => {
    // Sus tres opciones valen 0 desde la 077. Ofrecerla en el orden sugeriría
    // que subirla de rango hace algo.
    const dims = calibratableDimensions(REGLAS)
    expect(dims).not.toContain('property_use')
    expect(dims).toEqual(['timeline', 'financing', 'budget_tier', 'agent_status', 'contingency', 'geo_fit'])
  })
})

describe('currentOrder', () => {
  it('lee el orden vigente de los máximos', () => {
    expect(currentOrder(REGLAS).slice(0, 3)).toEqual(['timeline', 'financing', 'budget_tier'])
  })
})

describe('recalibrate', () => {
  it('sin cambios de orden no propone ningún cambio', () => {
    expect(recalibrate(REGLAS, currentOrder(REGLAS))).toEqual([])
  })

  it('reasigna los máximos existentes según el orden nuevo', () => {
    // Un mercado donde el presupuesto manda sobre el horizonte de compra.
    const orden = ['budget_tier', 'financing', 'timeline', 'agent_status', 'contingency', 'geo_fit']
    const out   = aplicar(REGLAS, orden)

    const max = (d: string) => Math.max(...out.filter(r => r.dimension === d).map(r => r.points))
    expect(max('budget_tier')).toBe(30)
    expect(max('financing')).toBe(25)
    expect(max('timeline')).toBe(20)
  })

  it('conserva la forma interna de cada dimensión', () => {
    const orden = ['budget_tier', 'financing', 'timeline', 'agent_status', 'contingency', 'geo_fit']
    const out   = aplicar(REGLAS, orden)
    const p = (d: string, v: string) => out.find(r => r.dimension === d && r.matchValue === v)!.points

    // budget_tier era 20/12/5/0 y pasa a un máximo de 30: 12→18, 5→8 (redondeo).
    expect(p('budget_tier', 'premium')).toBe(30)
    expect(p('budget_tier', 'mid')).toBe(18)
    expect(p('budget_tier', 'entry')).toBe(8)
    expect(p('budget_tier', 'undefined')).toBe(0)
    // El orden interno nunca se invierte.
    expect(p('budget_tier', 'premium')).toBeGreaterThan(p('budget_tier', 'mid'))
    expect(p('budget_tier', 'mid')).toBeGreaterThan(p('budget_tier', 'entry'))
  })

  it('NO escala los puntos negativos', () => {
    // agent_status sube de 5 a 30 de máximo. Escalar el -15 por el mismo factor
    // lo dejaría en -90: un lead que ya tiene agente caería a cero por sí solo.
    const orden = ['agent_status', 'timeline', 'financing', 'budget_tier', 'contingency', 'geo_fit']
    const out   = aplicar(REGLAS, orden)
    expect(out.find(r => r.dimension === 'agent_status' && r.matchValue === 'sin_agente')!.points).toBe(30)
    expect(out.find(r => r.dimension === 'agent_status' && r.matchValue === 'con_agente')!.points).toBe(-15)
    expect(out.find(r => r.dimension === 'geo_fit' && r.matchValue === 'fuera_de_zona')!.points).toBe(-10)
  })

  it('el techo del fit de compra no se mueve — las bandas no pueden romperse', () => {
    // Es la invariante que hace segura toda la operación: reordenar reparte los
    // mismos máximos, así que `reach` da exactamente lo mismo y la banda Alta no
    // puede volverse inalcanzable sin que nadie se entere.
    const antes = computeScoreReach(asReach(REGLAS))
    for (const orden of [
      ['budget_tier', 'financing', 'timeline', 'agent_status', 'contingency', 'geo_fit'],
      ['geo_fit', 'contingency', 'agent_status', 'budget_tier', 'financing', 'timeline'],
      ['financing', 'geo_fit', 'timeline', 'budget_tier', 'agent_status', 'contingency'],
    ]) {
      const despues = computeScoreReach(asReach(aplicar(REGLAS, orden)))
      expect(despues.fitBuyer).toBe(antes.fitBuyer)
      expect(despues.reachable).toBe(antes.reachable)
      expect(despues.warnings).toEqual(antes.warnings)
    }
  })

  it('una lista parcial completa el resto con el orden vigente', () => {
    // Que la UI mande media lista no puede dejar dimensiones sin máximo.
    const out = aplicar(REGLAS, ['geo_fit'])
    const max = (d: string) => Math.max(...out.filter(r => r.dimension === d).map(r => r.points))
    expect(max('geo_fit')).toBe(30)
    expect(computeScoreReach(asReach(out)).fitBuyer).toBe(computeScoreReach(asReach(REGLAS)).fitBuyer)
  })

  it('ignora dimensiones que no existen o no son calibrables', () => {
    const out = recalibrate(REGLAS, ['property_use', 'inventada', ...currentOrder(REGLAS)])
    expect(out).toEqual([])
  })

  it('no toca las dimensiones de venta', () => {
    // El orden es del camino de compra; `sell_motivation` y `listing_status` no
    // aparecen en BUY_DIMS y deben quedarse intactas.
    const conVenta = [...REGLAS, fit('sell_motivation', 'alta', 35), fit('listing_status', 'no_listado_sin_agente', 5)]
    const cambios  = recalibrate(conVenta, ['budget_tier', 'financing', 'timeline'])
    expect(cambios.every(c => BUY_DIMS.includes(c.dimension as never))).toBe(true)
  })
})
