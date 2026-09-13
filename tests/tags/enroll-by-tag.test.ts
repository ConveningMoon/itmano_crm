import { describe, it, expect, beforeEach, vi } from 'vitest'

// Estas pruebas cubren las guardas del disparo por etiqueta (117). Es el punto
// del sistema donde un fallo se traduce en un CORREO REAL al lead de alguien, así
// que cada caso fija una condición que tiene que impedir el envío:
//
//   · el lead ya salió del embudo vivo
//   · su canal de email está bloqueado (baja, rebote, queja)
//   · no existe la secuencia en el idioma que le toca
//   · la secuencia existe pero no tiene pasos
//   · ya hay una corrida activa
//
// El primer correo se procesa en proceso, así que processSequenceRun se mockea:
// el test mide si se INSCRIBE, no si Resend responde.

const processSequenceRun = vi.fn(async () => ({ action: 'sent', reason: null }))
vi.mock('@/lib/services/process-sequence-run', () => ({
  processSequenceRun: (...args: unknown[]) => processSequenceRun(...(args as [])),
}))

const { enrollLeadByTag, cancelTagSequenceRuns } = await import('@/lib/services/enroll-lead-by-tag')

// ─── Fake de Supabase ─────────────────────────────────────────────────────────
// Devuelve por tabla lo que el caso configure y registra los updates/inserts.

interface Fixture {
  lead:      Record<string, unknown> | null
  sequences: Array<Record<string, unknown>>
  firstStep: Record<string, unknown> | null
  activeRun: Record<string, unknown> | null
}

let fx: Fixture
let inserted: Array<Record<string, unknown>>
let updates:  Array<Record<string, unknown>>

// reason: el doble del cliente de Supabase imita una API fluida encadenable; el
// tipo real no aporta nada aquí y el servicio recibe SupabaseClient por cast.
/* eslint-disable @typescript-eslint/no-explicit-any */

function fakeDb(): any {
  const chain = (table: string): any => {
    const self: any = {
      _op: 'select' as 'select' | 'insert' | 'update',
      select() { return self },
      eq()     { return self },
      in()     { return self },
      not()    { return self },
      order()  { return self },
      limit()  { return self },
      insert(row: Record<string, unknown>) { self._op = 'insert'; inserted.push({ table, ...row }); return self },
      update(row: Record<string, unknown>) { self._op = 'update'; updates.push({ table, ...row }); return self },
      maybeSingle() {
        if (table === 'leads')                return Promise.resolve({ data: fx.lead })
        if (table === 'email_sequence_steps') return Promise.resolve({ data: fx.firstStep })
        if (table === 'lead_sequence_runs')   return Promise.resolve({ data: fx.activeRun })
        return Promise.resolve({ data: null })
      },
      single() {
        // Sólo lo usa el insert de la corrida.
        return Promise.resolve({ data: { id: 'run-nuevo' }, error: null })
      },
      then(resolve: (v: unknown) => void) {
        if (table === 'email_sequences')    return resolve({ data: fx.sequences, error: null })
        if (table === 'lead_sequence_runs') return resolve({ data: [{ id: 'run-1' }], error: null })
        return resolve({ data: [], error: null })
      },
    }
    return self
  }
  return { from: (table: string) => chain(table) }
}

const ARGS = { lead_id: 'lead-1', tag_id: 'tag-csr', tenant_id: 'tenant-aj' }

function lead(over: Record<string, unknown> = {}) {
  return {
    id: 'lead-1', stage: 'nuevo', language: 'es', email_blocked: false,
    email_blocked_reason: null,
    agents: { id: 'agent-1', language: 'es', languages: ['es', 'en'] },
    ...over,
  }
}

beforeEach(() => {
  processSequenceRun.mockClear()
  inserted = []
  updates  = []
  fx = {
    lead:      lead(),
    sequences: [{ id: 'seq-es', name: 'Contactado sin respuesta · Español', language: 'es' }],
    firstStep: { step_order: 1, delay_hours: 0 },
    activeRun: null,
  }
})

describe('enrollLeadByTag — inscribe', () => {
  it('inscribe en la secuencia del idioma del lead y manda el primer correo', async () => {
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })

    expect(res).toMatchObject({ enrolled: true, sequenceId: 'seq-es', language: 'es' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      table: 'lead_sequence_runs', lead_id: 'lead-1', sequence_id: 'seq-es', status: 'active',
    })
    expect(processSequenceRun).toHaveBeenCalledTimes(1)
  })

  it('elige la versión del idioma del lead cuando hay varias', async () => {
    fx.lead = lead({ language: 'en' })
    fx.sequences = [
      { id: 'seq-es', name: 'CSR · Español', language: 'es' },
      { id: 'seq-en', name: 'CSR · English', language: 'en' },
    ]
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toMatchObject({ enrolled: true, sequenceId: 'seq-en' })
  })

  it('un lead en un idioma que su agente no atiende recibe la versión en inglés', async () => {
    fx.lead = lead({ language: 'pt', agents: { id: 'a', language: 'es', languages: ['es', 'en'] } })
    fx.sequences = [
      { id: 'seq-es', name: 'CSR · Español', language: 'es' },
      { id: 'seq-en', name: 'CSR · English', language: 'en' },
    ]
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toMatchObject({ enrolled: true, sequenceId: 'seq-en', language: 'en' })
  })
})

describe('enrollLeadByTag — no inscribe (y por qué)', () => {
  it('etiqueta sin ninguna secuencia: no es un fallo, es el caso normal', async () => {
    fx.sequences = []
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toEqual({ enrolled: false, reason: 'no_sequence' })
    expect(inserted).toHaveLength(0)
  })

  it('falta la versión del idioma que le toca: no se manda en otro idioma', async () => {
    fx.lead = lead({ language: 'en' })
    fx.sequences = [{ id: 'seq-es', name: 'CSR · Español', language: 'es' }]

    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })

    expect(res).toEqual({ enrolled: false, reason: 'no_sequence_for_language', language: 'en' })
    expect(inserted).toHaveLength(0)
    expect(processSequenceRun).not.toHaveBeenCalled()
  })

  it('lead fuera del embudo vivo: una secuencia de nutrición ahí contradice al agente', async () => {
    for (const stage of ['en_proceso', 'cerrado', 'perdido']) {
      inserted = []
      fx.lead = lead({ stage })
      const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
      expect(res).toEqual({ enrolled: false, reason: 'out_of_funnel' })
      expect(inserted).toHaveLength(0)
    }
  })

  it('email bloqueado: la etiqueta se pone, el correo no sale', async () => {
    fx.lead = lead({ email_blocked: true, email_blocked_reason: 'unsubscribed' })
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toEqual({ enrolled: false, reason: 'email_blocked' })
    expect(inserted).toHaveLength(0)
  })

  it('secuencia sin pasos activos: no hay nada que enviar', async () => {
    fx.firstStep = null
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toEqual({ enrolled: false, reason: 'no_steps', language: 'es' })
    expect(inserted).toHaveLength(0)
  })

  it('ya había una corrida activa: no se duplica el envío', async () => {
    fx.activeRun = { id: 'run-existente' }
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toEqual({ enrolled: false, reason: 'already_active', language: 'es' })
    expect(inserted).toHaveLength(0)
  })

  it('lead inexistente no revienta', async () => {
    fx.lead = null
    const res = await enrollLeadByTag({ db: fakeDb(), ...ARGS })
    expect(res).toEqual({ enrolled: false, reason: 'error' })
  })
})

describe('cancelTagSequenceRuns', () => {
  it('cancela las corridas activas con el motivo tag_removed', async () => {
    const n = await cancelTagSequenceRuns({ db: fakeDb(), ...ARGS })

    expect(n).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      table: 'lead_sequence_runs', status: 'cancelled', cancelled_reason: 'tag_removed',
    })
  })

  it('sin secuencias de esa etiqueta no toca ninguna corrida', async () => {
    fx.sequences = []
    const n = await cancelTagSequenceRuns({ db: fakeDb(), ...ARGS })
    expect(n).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
