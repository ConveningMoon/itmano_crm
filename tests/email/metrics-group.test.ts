import { describe, it, expect } from 'vitest'
import { groupSendsBySequence, type SendWithRun } from '@/lib/services/email-metrics-group'

function send(runId: string, leadId: string, stepOrder = 1): SendWithRun {
  return { lead_id: leadId, step_order: stepOrder, sent_at: '2026-08-01T10:00:00Z', sequence_run_id: runId }
}

// run → secuencia. Dos runs de la misma secuencia y uno de otra: el caso que el
// batch tiene que separar bien.
const RUNS = new Map<string, string>([
  ['run-a1', 'seq-a'],
  ['run-a2', 'seq-a'],
  ['run-b1', 'seq-b'],
])

describe('groupSendsBySequence', () => {
  it('junta los runs de una misma secuencia', () => {
    const grouped = groupSendsBySequence(
      [send('run-a1', 'lead-1'), send('run-a2', 'lead-2')],
      RUNS,
    )
    expect(grouped.get('seq-a')).toHaveLength(2)
  })

  it('no mezcla envios entre secuencias', () => {
    const grouped = groupSendsBySequence(
      [send('run-a1', 'lead-1'), send('run-b1', 'lead-2'), send('run-a2', 'lead-3')],
      RUNS,
    )
    expect(grouped.get('seq-a')?.map(s => s.lead_id)).toEqual(['lead-1', 'lead-3'])
    expect(grouped.get('seq-b')?.map(s => s.lead_id)).toEqual(['lead-2'])
  })

  // Un run desconocido cayendo en otro cubo inflaria una secuencia ajena.
  it('descarta los envios de un run que no esta en el mapa', () => {
    const grouped = groupSendsBySequence(
      [send('run-a1', 'lead-1'), send('run-huerfano', 'lead-2')],
      RUNS,
    )
    expect(grouped.get('seq-a')).toHaveLength(1)
    expect([...grouped.keys()]).toEqual(['seq-a'])
  })

  it('una secuencia sin envios no aparece en el mapa', () => {
    const grouped = groupSendsBySequence([send('run-a1', 'lead-1')], RUNS)
    expect(grouped.has('seq-b')).toBe(false)
  })

  it('sin envios devuelve un mapa vacio', () => {
    expect(groupSendsBySequence([], RUNS).size).toBe(0)
  })
})
