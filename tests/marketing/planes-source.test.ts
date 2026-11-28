import { describe, expect, it } from 'vitest'
import { PLANS } from '@/lib/plans'
import { buildPlanRows } from '@/lib/marketing/plan-rows'

// /planes no promete nada que PLANS no respalde: cada tope sale de la fuente
// única, formateado igual que en la página.

const rows = buildPlanRows().flatMap(g => g.rows)
const row = (label: string) => {
  const r = rows.find(x => x.label === label)
  if (!r) throw new Error(`Falta la fila "${label}"`)
  return r.values
}
const fmt = (v: number) => v.toLocaleString('en-US')

describe('/planes lee sus valores de PLANS', () => {
  it('agentes rastreados: Esencial y Growth 1, Partner ilimitados', () => {
    expect(PLANS.growth.limits.trackedAgents).toBe(1)
    expect(row('Agentes del equipo con seguimiento')).toEqual(['1', '1', 'Ilimitados'])
  })

  it('leads, correos y propiedades coinciden con los topes', () => {
    expect(row('Leads / contactos')).toEqual([fmt(2500), fmt(10000), 'Ilimitados'])
    expect(row('Correos por mes')).toEqual([
      fmt(PLANS.esencial.limits.emailsPerMonth),
      fmt(PLANS.growth.limits.emailsPerMonth),
      fmt(PLANS.partner.limits.emailsPerMonth),
    ])
    expect(row('Propiedades publicadas en tu web')).toEqual([false, fmt(50), 'Ilimitadas'])
  })

  it('no promete niveles de analytics: sólo la vista de equipo de Partner', () => {
    expect(rows.some(r => r.values.some(v => typeof v === 'string' && /completos/i.test(v)))).toBe(false)
    expect(row('Vista consolidada de equipo')).toEqual([false, false, true])
  })

  it('los reportes para todos los planes no prometen la pestaña por agente (Partner)', () => {
    expect(row('Reportes del negocio (fuente y correo)')).toEqual([true, true, true])
    expect(rows.some(r => /Reportes del negocio \(agente/.test(r.label))).toBe(false)
  })
})
