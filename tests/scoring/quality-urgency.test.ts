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
    stage: 'nuevo',
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
    .select('quality_score, current_score, engagement_score, fit_score, last_signal_at, last_signal_type, stage')
    .eq('id', LEAD_ID).single()
  return data as unknown as {
    quality_score: number; current_score: number; engagement_score: number
    fit_score: number; last_signal_at: string | null; last_signal_type: string | null
    stage: string
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
  await adminClient.from('lead_status_history').delete().eq('lead_id', LEAD_ID)
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

  it('se calcula tambien fuera del embudo activo', async () => {
    // Ya no existe el congelado (082), pero la propiedad que importaba sigue en
    // pie: un lead cerrado se mide igual. Analytics necesita su calidad para
    // poder comparar que fuente trae leads que cierran.
    await freshLead({ fit_profile: { financing: 'cash' }, stage: 'cerrado' })
    await recompute()

    const lead = await getLead()
    expect(lead.stage).toBe('cerrado')
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
    await freshLead({ stage: 'en_proceso' })
    await insertEvent('email_replied')
    await recompute()

    const v = await getView()
    expect(v.stage).toBe('en_proceso')
    expect(v.urgency).toBeNull()
    expect(v.urgency_rank).toBe(9)
  })

  it('un fit alto sube la calidad pero NO mueve la etapa', async () => {
    // Es la propiedad que hace innecesario el congelado: si el scoring no toca
    // la etapa, no hay nada que proteger apagando la medición.
    await freshLead({ fit_profile: { financing: 'cash', timeline: 'under_3_months' } })
    await recompute()

    const v = await getView()
    expect(v.stage).toBe('nuevo')          // donde lo dejó el agente
    expect(v.quality_band).toBe('media')   // 55, la calidad sí se movió
  })

  it('la etapa que pone el agente sobrevive a un recálculo', async () => {
    await freshLead({ stage: 'nutricion', fit_profile: { financing: 'cash' } })
    await insertEvent('email_clicked')
    await recompute()

    expect((await getView()).stage).toBe('nutricion')
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

  it('un lead en proceso conserva sus ejes pero no tiene posición', async () => {
    // La tarjeta necesita mostrar etapa y calidad incluso fuera de la cola; lo
    // que NO debe mostrar es un puesto, porque ese lead ya no compite por la
    // atención del día y darle uno sería mentir.
    const { getLeadPriorityPosition } = await import('@/lib/data/leads')
    await freshLead({ stage: 'en_proceso', fit_profile: { financing: 'cash' } })
    await recompute()

    const pos = await getLeadPriorityPosition(LEAD_ID, { tenantId: TENANT_A_ID, agentId: null })
    expect(pos).not.toBeNull()
    expect(pos!.stage).toBe('en_proceso')
    expect(pos!.urgency).toBeNull()
    expect(pos!.rank).toBe(0)
    expect(pos!.total).toBe(0)
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

describe('La urgencia de la IA caduca (079)', () => {
  // El briefing es una foto del momento en que se escribió. Sin caducidad, un
  // "llamar hoy" de hace dos semanas seguía llenando la cola del día para
  // siempre — el eje de urgencia dejaba de medir urgencia.
  const aiFit = (when: string, daysAgo: number) => ({
    ai_fit: { next_action_when: when, at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() },
  })

  it('un briefing reciente manda sobre la señal', async () => {
    await freshLead({ metadata: aiFit('hoy', 0) })
    await insertEvent('email_clicked', 20)   // por sí sola daría sin_apuro
    await recompute()

    const v = await getView()
    expect(v.urgency).toBe('hoy')
    expect(v.urgency_rank).toBe(0)
  })

  it('un "hoy" de hace diez días ya no es hoy', async () => {
    await freshLead({ metadata: aiFit('hoy', 10) })
    await insertEvent('email_clicked', 20)
    await recompute()

    const v = await getView()
    expect(v.urgency).toBe('sin_apuro')
  })

  it('caducado, decide la regla determinista sobre la última señal', async () => {
    // El briefing viejo decía sin_apuro, pero el lead acaba de responder.
    await freshLead({ metadata: aiFit('sin_apuro', 30) })
    await insertEvent('email_replied')
    await recompute()

    expect((await getView()).urgency).toBe('hoy')
  })

  it('un briefing sin fecha no cuenta', async () => {
    // Briefings anteriores a que se guardara `at`: no se puede saber si siguen
    // vigentes, así que no mandan.
    await freshLead({ metadata: { ai_fit: { next_action_when: 'hoy' } } })
    await recompute()

    expect((await getView()).urgency).toBe('sin_apuro')
  })

  it('un `at` corrupto no tumba la vista', async () => {
    await freshLead({ metadata: { ai_fit: { next_action_when: 'hoy', at: 'ayer por la tarde' } } })
    await insertEvent('email_replied')
    await recompute()

    expect((await getView()).urgency).toBe('hoy')   // cae a la señal, sin error
  })
})

describe('Cerrados del mes — por fecha de cierre, no de alta (079)', () => {
  async function closedStats() {
    const { data } = await adminClient.rpc('lead_dashboard_stats', {
      p_tenant_id: TENANT_A_ID, p_agent_id: null,
    })
    return (data as { closed_this_month: number }).closed_this_month
  }

  async function setHistory(daysAgo: number) {
    await adminClient.from('lead_status_history').delete().eq('lead_id', LEAD_ID)
    const { error } = await adminClient.from('lead_status_history').insert({
      lead_id: LEAD_ID, tenant_id: TENANT_A_ID,
      from_status: 'nutricion', to_status: 'cerrado', source: 'agent',
      changed_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    })
    // Sin esto, un insert rechazado deja el test en verde por la razón contraria.
    if (error) throw new Error(`setHistory failed: ${error.message}`)
  }

  it('un lead viejo cerrado hoy sí cuenta', async () => {
    // Justo el caso que el conteo por created_at perdía.
    await freshLead({ stage: 'cerrado', created_at: new Date('2026-01-15').toISOString() })
    await setHistory(0)
    expect(await closedStats()).toBeGreaterThanOrEqual(1)
  })

  it('un cierre de hace medio año no cuenta', async () => {
    await freshLead({ stage: 'cerrado', created_at: new Date().toISOString() })
    await setHistory(180)
    expect(await closedStats()).toBe(0)
  })

  it('un cerrado sin historial no cuenta', async () => {
    // Los leads importados entraron ya cerrados: no sabemos cuándo fue, y
    // decir que fue este mes sería inventarlo.
    await freshLead({ stage: 'cerrado' })
    await adminClient.from('lead_status_history').delete().eq('lead_id', LEAD_ID)
    expect(await closedStats()).toBe(0)
  })
})

describe('Importados: fuera del embudo, dentro del total (080)', () => {
  async function stats() {
    const { data } = await adminClient.rpc('lead_dashboard_stats', {
      p_tenant_id: TENANT_A_ID, p_agent_id: null,
    })
    return data as { imported: number; total: number; by_stage: Record<string, number> }
  }

  it('un lead marcado como importado no cuenta en el embudo', async () => {
    // Nació cerrado en otro CRM: nunca pasó por "nuevo" aquí, y contarlo daba
    // una tasa de paso del 100% que no describía ninguna operación real.
    await freshLead({ stage: 'cerrado', metadata: { imported: { system: 'hubspot' } } })

    const s = await stats()
    expect(s.imported).toBeGreaterThanOrEqual(1)
    expect(s.by_stage.cerrado ?? 0).toBe(0)
  })

  it('pero sí cuenta en el total de la cartera', async () => {
    await freshLead({ stage: 'cerrado', metadata: { imported: { system: 'hubspot' } } })
    expect((await stats()).total).toBeGreaterThanOrEqual(1)
  })

  it('sin la marca, el lead entra al embudo con normalidad', async () => {
    await freshLead({ stage: 'cerrado' })

    const s = await stats()
    expect(s.imported).toBe(0)
    expect(s.by_stage.cerrado ?? 0).toBeGreaterThanOrEqual(1)
  })
})

describe('Dimensiones nuevas del formulario (077)', () => {
  it('la contingencia de venta resta calidad', async () => {
    await freshLead({ fit_profile: { financing: 'cash', contingency: 'con_contingencia' } })
    await recompute()
    // 25 (efectivo) - 10 (debe vender primero)
    expect((await getLead()).quality_score).toBe(15)
  })

  it('no tener contingencia suma', async () => {
    await freshLead({ fit_profile: { financing: 'cash', contingency: 'sin_contingencia' } })
    await recompute()
    expect((await getLead()).quality_score).toBe(30)
  })

  it('fuera de la zona de la agencia resta', async () => {
    await freshLead({ fit_profile: { financing: 'cash', geo_fit: 'fuera_de_zona' } })
    await recompute()
    expect((await getLead()).quality_score).toBe(15)
  })

  it('el uso de la propiedad se captura pero NO puntúa', async () => {
    // Se registra para el briefing y para analytics; ordenarlo por intuición
    // sería volver a los números inventados. Se calibrará con datos reales.
    await freshLead({ fit_profile: { financing: 'cash', property_use: 'inversion' } })
    await recompute()
    expect((await getLead()).quality_score).toBe(25)

    await freshLead({ fit_profile: { financing: 'cash', property_use: 'vivienda_principal' } })
    await recompute()
    expect((await getLead()).quality_score).toBe(25)
  })

  it('cada dimensión aporta una sola vez y se suman entre sí', async () => {
    await freshLead({ fit_profile: {
      financing: 'cash', timeline: 'under_3_months',
      contingency: 'sin_contingencia', geo_fit: 'zona_principal',
    } })
    await recompute()
    // 25 + 30 + 5 + 5
    expect((await getLead()).quality_score).toBe(65)
  })
})
