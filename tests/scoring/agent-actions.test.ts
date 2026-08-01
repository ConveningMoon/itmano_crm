import { describe, it, expect } from 'vitest'
import { agentActionTypes, FIXED_AGENT_ACTION_TYPES } from '@/lib/scoring/agent-actions'

// Las dimensiones manuales que hay HOY en lead_score_rules. No se usan como
// fuente de verdad —el código las lee de la base— sino como muestra realista.
const MANUALES_ACTUALES = [
  'visit_attended', 'proposal_sent', 'appointment_scheduled',
  'no_show_no_answer', 'manual_disqualify',
]

// Los nombres que la lista hardcodeada buscaba, de la migración 009. Ninguno se
// emite ya: son exactamente los que hacían que la métrica midiera al revés.
const MUERTOS = ['score_manual', 'phone_call', 'consultation_scheduled', 'consultation_attended']

describe('agentActionTypes — qué cuenta como acción del agente', () => {
  it('incluye las acciones del panel manual', () => {
    const tipos = agentActionTypes(MANUALES_ACTUALES)
    for (const d of MANUALES_ACTUALES) expect(tipos).toContain(d)
  })

  it('incluye las fijas que no son reglas de scoring', () => {
    const tipos = agentActionTypes(MANUALES_ACTUALES)
    expect(tipos).toContain('manual_email_sent')  // correo one-off
    expect(tipos).toContain('status_changed')     // movió la etapa
  })

  it('no arrastra los nombres muertos de la migración 009', () => {
    const tipos = agentActionTypes(MANUALES_ACTUALES)
    for (const d of MUERTOS) expect(tipos).not.toContain(d)
  })

  it('sin reglas manuales quedan al menos las fijas, nunca una lista vacía', () => {
    // Una lista vacía daría "no siguió" en TODOS los briefings, que es peor que
    // subcontar: convierte un fallo de lectura en una conclusión falsa.
    const tipos = agentActionTypes([])
    expect(tipos).toEqual([...FIXED_AGENT_ACTION_TYPES].sort())
    expect(tipos.length).toBeGreaterThan(0)
  })

  it('no repite si una regla manual coincide con una fija', () => {
    const tipos = agentActionTypes(['status_changed', 'visit_attended'])
    expect(tipos.filter(t => t === 'status_changed')).toHaveLength(1)
  })

  it('el orden es estable, para que la query no cambie sin motivo', () => {
    expect(agentActionTypes(['b', 'a'])).toEqual(agentActionTypes(['a', 'b']))
  })
})
