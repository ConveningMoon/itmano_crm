/**
 * Modelo calidad + urgencia (migración 076).
 *
 * Lo que se fija aquí es la propiedad que da sentido a todo el rediseño:
 * la CALIDAD no decae y el score sí, así que un lead que se queda callado
 * conserva su calidad y solo pierde urgencia. Antes, ese lead "empeoraba".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import ws from 'ws'
import {
  adminClient,
  TENANT_A_ID,
  AGENT_A_ID,
  CHANNEL_A_UUID,
  createFixtures,
  cleanupFixtures,
} from '../rls/setup'

// Node 21 no trae WebSocket nativo y supabase-js lo exige al construir el cliente
// de Realtime. La app corre en Node 24 (Vercel) y no le afecta; aquí se rellena
// para poder importar src/lib/data/leads y probar la función real, no una copia.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = ws

const LEAD_ID = 'lead-quality-urgency-01'

async function freshLead(overrides: Record<string, unknown> = {}) {
  await adminClient.from('lead_events').delete().eq('lead_id', LEAD_ID)
  await adminClient.from('lead_status_history').delete().eq('lead_id', LEAD_ID)
  await adminClient.from('notifications').delete().eq('lead_id', LEAD_ID)
  await adminClient.from('leads').delete().eq('id', LEAD_ID)

  const { error } = await adminClient.from('leads').insert({
    id: LEAD_ID,
    tenant_id: TENANT_A_ID,
    agent_id: AGENT_A_ID,
    acquisition_channel_id: CHANNEL_A_UUID,
    first_name: 'Calidad',
    last_name: 'TestLead',
    email: 'calidad-test@test.invalid',
    language: 'es',
    status: 'new',
    current_score: 0,
    peak_score: 0,
    fit_profile: {},
    ...overrides,
  })
  if (error) throw new Error(`freshLead insert failed: ${error.message}`)
}

/** Inserta un evento con una antigüedad concreta, para provocar decaimiento. */
async function insertEvent(type: string, daysAgo = 0) {
  const payload: Record<string, unknown> = {
    lead_id: LEAD_ID, tenant_id: TENANT_A_ID, type, description: `test: ${type}`,
  }
  if (daysAgo > 0) payload.created_at = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
  const { error } = await adminClient.from('lead_events').insert(payload)
  if (error) throw new Error(`insertEvent failed: ${error.message}`)
}

async function recompute() {
  await adminClient.rpc('recompute_lead_score', { p_lead_id: LEAD_ID })
}

async function getLead() {
  const { data } = await adminClient
    .from('leads')
    .select('quality_score, current_score, engagement_score, fit_score, last_signal_at, last_signal_type, status')
    .eq('id', LEAD_ID).single()
  return data as unknown as {
    quality_score: number; current_score: number; engagement_score: number
    fit_score: number; last_signal_at: string | null; last_signal_type: string | null
    status: string
  }
}

async function getView() {
  const { data } = await adminClient
    .from('leads_list')
    .select('stage, quality_band, urgency, urgency_rank')
    .eq('id', LEAD_ID).single()
  return data as unknown as {
    stage: string; quality_band: string; urgency: string | null; urgency_rank: number
  }
}

beforeAll(async () => { await createFixtures() })
afterAll(async () => {
  await adminClient.from('lead_events').delete().eq('lead_id', LEAD_ID)
  await adminClient.from('leads').delete().eq('id', LEAD_ID)
  await cleanupFixtures()
})

describe('Calidad — no decae', () => {
  it('un clic viejo cuenta entero en calidad pero decaído en el score', async () => {
    await freshLead()
    // email_clicked: +10, decays=true. A 74 días ya se partió a la mitad dos veces.
    await insertEvent('email_clicked', 74)
    await recompute()

    const lead = await getLead()
    expect(lead.quality_score).toBe(10)              // íntegro: el clic ocurrió
    expect(lead.engagement_score).toBeLessThan(10)   // decaído en el score viejo
    expect(lead.current_score).toBeLessThan(lead.quality_score)
  })

  it('el fit entra igual en calidad y en score', async () => {
    await freshLead({ fit_profile: { financing: 'cash' } })   // +25
    await recompute()
    const lead = await getLead()
    expect(lead.fit_score).toBe(25)
    expect(lead.quality_score).toBe(25)
  })

  it('se calcula también en estados congelados', async () => {
    // El congelado protege la decisión del AGENTE sobre status; no es razón para
    // dejar de medir al lead. Analytics necesita la calidad de los cerrados.
    await freshLead({ fit_profile: { financing: 'cash' }, status: 'closed' })
    await recompute()

    const lead = await getLead()
    expect(lead.status).toBe('closed')
    expect(lead.quality_score).toBe(25)
  })
})

describe('Última señal — solo eventos positivos', () => {
  it('registra la señal positiva con su tipo', async () => {
    await freshLead()
    await insertEvent('email_replied')
    await recompute()

    const lead = await getLead()
    expect(lead.last_signal_type).toBe('email_replied')
    expect(lead.last_signal_at).not.toBeNull()
  })

  it('un evento sin regla no cuenta como señal', async () => {
    await freshLead()
    await insertEvent('email_delivered')   // no tiene regla
    await recompute()
    expect((await getLead()).last_signal_at).toBeNull()
  })

  it('un evento negativo tampoco cuenta como señal', async () => {
    await freshLead()
    await insertEvent('email_hard_bounce') // -30: no hace urgente a nadie
    await recompute()
    expect((await getLead()).last_signal_at).toBeNull()
  })
})

describe('Vista — etapa, banda y urgencia', () => {
  it('una respuesta reciente pone la urgencia en hoy', async () => {
    await freshLead()
    await insertEvent('email_replied')
    await recompute()

    const v = await getView()
    expect(v.urgency).toBe('hoy')
    expect(v.urgency_rank).toBe(0)
  })

  it('una señal de hace 20 días cae a sin prisa', async () => {
    await freshLead()
    await insertEvent('email_clicked', 20)
    await recompute()

    const v = await getView()
    expect(v.urgency).toBe('sin_apuro')
    expect(v.urgency_rank).toBe(2)
  })

  it('un lead en proceso sale de la cola de urgencia', async () => {
    await freshLead({ status: 'process_started' })
    await insertEvent('email_replied')
    await recompute()

    const v = await getView()
    expect(v.stage).toBe('en_proceso')
    expect(v.urgency).toBeNull()
    expect(v.urgency_rank).toBe(9)
  })

  it('las bandas de score se agrupan bajo la etapa nutrición', async () => {
    // financing cash (25) + timeline <3m (30) = 55 → status 'warm' → etapa nutrición
    await freshLead({ fit_profile: { financing: 'cash', timeline: 'under_3_months' } })
    await recompute()

    const v = await getView()
    expect(v.stage).toBe('nutricion')
  })

  it('con pocos leads activos la banda usa los cortes fijos', async () => {
    await freshLead({ fit_profile: { financing: 'cash', timeline: 'under_3_months' } })
    await recompute()

    const v = await getView()
    expect(v.quality_band).toBe('media')   // 55 cae en [35, 60)
  })
})

describe('getLeadPriorityPosition — el ranking sale de Postgres', () => {
  it('devuelve la posición dentro de la cartera activa', async () => {
    const { getLeadPriorityPosition } = await import('@/lib/data/leads')
    await freshLead({ fit_profile: { financing: 'cash', timeline: 'under_3_months' } })
    await recompute()

    const pos = await getLeadPriorityPosition(LEAD_ID, { tenantId: TENANT_A_ID, agentId: null })
    expect(pos).not.toBeNull()
    expect(pos!.rank).toBeGreaterThanOrEqual(1)
    expect(pos!.rank).toBeLessThanOrEqual(pos!.total)
  })

  it('un lead en proceso no tiene posición — no compite por la atención', async () => {
    const { getLeadPriorityPosition } = await import('@/lib/data/leads')
    await freshLead({ status: 'process_started' })
    await recompute()

    const pos = await getLeadPriorityPosition(LEAD_ID, { tenantId: TENANT_A_ID, agentId: null })
    expect(pos).toBeNull()
  })

  it('respeta el scope de visibilidad del agente', async () => {
    const { getLeadPriorityPosition } = await import('@/lib/data/leads')
    await freshLead({ fit_profile: { financing: 'cash' } })
    await recompute()

    // Un agente que no es dueño del lead no lo ve, así que no hay posición.
    const ajeno = await getLeadPriorityPosition(LEAD_ID, { tenantId: TENANT_A_ID, agentId: 'agent-que-no-existe' })
    expect(ajeno).toBeNull()
  })
})
